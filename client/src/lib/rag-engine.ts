import { TaskType, TaskPriority } from "./types";
let pdfjsInitialized = false;

async function getPDFJS() {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== "undefined" && !pdfjsInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    pdfjsInitialized = true;
  }
  return pdfjs;
}

async function getTesseract() {
  return await import('tesseract.js');
}

interface TypeRule {
  pattern: RegExp;
  type: TaskType;
  mul: number;
  durMins: number;
  diffDelta: number;
}

const TYPE_RULES: TypeRule[] = [
  { pattern: /theorem|proof|law|principle|concept|definition|what is|introduction|overview|fundamentals|theory|basis|foundation|understand/i, type: "learning", mul: 1.4, durMins: 60, diffDelta: 0 },
  { pattern: /implement|code|build|write|program|algorithm|solve|exercise|problem|apply|construct|develop|create|design and|compute/i, type: "problem_solving", mul: 1.3, durMins: 90, diffDelta: 1 },
  { pattern: /report|essay|summary|document|draft|write up|explain|describe|analysis|write a|prepare a/i, type: "writing", mul: 1.1, durMins: 75, diffDelta: 0 },
  { pattern: /revise|review|recap|practice problems|test yourself|quiz|re-read|consolidate|reinforce|go over/i, type: "revision", mul: 0.9, durMins: 45, diffDelta: -1 },
  { pattern: /read|chapter|section|study|textbook|notes|material|reference|literature|go through/i, type: "reading", mul: 0.8, durMins: 45, diffDelta: -1 },
];

const DIFF_SIGNALS: [RegExp, number][] = [
  [/advanced|complex|optimis|dynamic programming|distributed|concurrent|recursive|asymptotic|proof|NP-hard|eigenvalue|gradient|backprop|derive/i, 2],
  [/implement|algorithm|analysis|design|architecture|protocol|schema|system/i, 1],
  [/basic|intro|simple|overview|introduction|what is|getting started|fundamentals|survey/i, -1],
];

export function classifyTopic(t: string): TypeRule {
  for (const r of TYPE_RULES) {
    if (r.pattern.test(t)) return r;
  }
  return TYPE_RULES[0];
}

export function scoreDifficulty(t: string, p: number, total: number): number {
  let s = 2;
  for (const [pat, d] of DIFF_SIGNALS) {
    if (pat.test(t)) {
      s += d;
      break;
    }
  }
  s += Math.floor((p / Math.max(1, total)) * 2);
  return Math.min(5, Math.max(1, s));
}

export function computeCL(d: number, m: number, dur: number): number {
  const w = dur <= 30 ? 0.8 : dur <= 60 ? 1 : dur <= 90 ? 1.2 : 1.4;
  return parseFloat((d * m * w).toFixed(2));
}

export function parseDeadline(s: string): Date {
  const td = new Date();
  td.setHours(0, 0, 0, 0);
  const m = s.match(/in\s+(\d+)\s+(day|week|month)/i);
  if (m) {
    const n = +m[1];
    const u = m[2].toLowerCase();
    const d = new Date(td);
    if (u === "day") d.setDate(d.getDate() + n);
    if (u === "week") d.setDate(d.getDate() + n * 7);
    if (u === "month") d.setMonth(d.getMonth() + n);
    return d;
  }
  const p = new Date(s);
  if (!isNaN(p.getTime())) return p;
  const fb = new Date(td);
  fb.setDate(fb.getDate() + 14);
  return fb;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function extractTopics(text: string): string[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const topics: string[] = [];
  for (const line of lines) {
    const num = line.match(/^(\d+[\.\)]\d*[\.\)]?\s*)+(.+)/);
    if (num) {
      topics.push(num[num.length - 1].trim());
      continue;
    }
    const bul = line.match(/^[-•*✦→]\s+(.+)/);
    if (bul) {
      topics.push(bul[1].trim());
      continue;
    }
    if (line.length < 70 && !line.endsWith(".") && line.length > 5 && !/^[A-Z\s]{10,}$/.test(line)) {
      topics.push(line);
    }
  }
  return [...new Set(topics)].filter(t => t.length > 4);
}

export function chunkText(text: string, size = 280): string[] {
  const paras = text.split(/\n{2,}/).filter(p => p.trim().length > 20);
  const chunks: string[] = [];
  for (const p of paras) {
    if (p.length <= size) {
      chunks.push(p.trim());
      continue;
    }
    const sents = p.split(/(?<=[.!?])\s+/);
    let cur = "";
    for (const s of sents) {
      if (cur.length + s.length > size && cur) {
        chunks.push(cur.trim());
        cur = s;
      } else {
        cur += (cur ? " " : "") + s;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
  }
  return chunks.filter(c => c.length > 10);
}

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

export function topK(q: number[], cE: number[][], chunks: string[], k = 10): { chunk: string; score: number; i: number }[] {
  return cE.map((e, i) => ({ chunk: chunks[i], score: cosineSim(q, e), i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(k, chunks.length));
}

export function buildTasksFromRAG(retrieved: { chunk: string }[], topic: string, deadline: string, subject?: string) {
  const fullText = retrieved.map(r => r.chunk).join("\n");
  let topics = extractTopics(fullText);
  
  if (topics.length < 3) {
    topics = retrieved.map(r => {
      const fl = r.chunk.split("\n")[0].trim();
      return fl.length < 80 ? fl : fl.slice(0, 65) + "…";
    });
  }
  
  if (!topics.some(t => /revise|review/i.test(t))) {
    topics.push(`Revision: ${topic} — consolidate all key concepts`);
  }
  if (!topics.some(t => /exercise|problem|implement/i.test(t))) {
    topics.push(`Practice problems: ${topic} — mixed exercises`);
  }
  
  topics = [...new Set(topics)].slice(0, 14);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseDeadline(deadline);
  const totalDays = Math.max(1, Math.floor((end.getTime() - today.getTime()) / 86400000));
  
  const raw = topics.map((t, i) => {
    const cls = classifyTopic(t);
    const diff = Math.min(5, Math.max(1, scoreDifficulty(t, i, topics.length) + cls.diffDelta));
    const cl = computeCL(diff, cls.mul, cls.durMins);
    const posRatio = i / topics.length;
    
    let priority: 'high' | 'normal' | 'low' = 'low';
    if (diff >= 4) priority = 'high';
    else if (posRatio < 0.3 && (cls.type === 'learning' || cls.type === 'problem_solving')) priority = 'high';
    else if (totalDays <= 7 && posRatio < 0.5) priority = 'high';
    else if (cls.type === 'learning' || cls.type === 'problem_solving') priority = 'normal';
    else if (posRatio > 0.7) priority = 'normal';

    return { 
      name: t, 
      subject: subject || topic, 
      type: cls.type, 
      duration: cls.durMins, 
      difficulty: diff, 
      cl, 
      multiplier: cls.mul, // help with breakdown
      priority, 
      order: i,
      deadline: "" 
    };
  });
  
  const totalCL = raw.reduce((s, t) => s + t.cl, 0);
  let cum = 0;
  
  return raw.map(t => {
    cum += t.cl;
    const offset = Math.max(1, Math.floor((cum / Math.max(totalCL, 0.1)) * totalDays));
    const d = new Date(today);
    d.setDate(today.getDate() + Math.min(offset, totalDays));
    return { ...t, deadline: d.toISOString() };
  });
}

// ── File Parsing ──────────────────────────────────────────

export async function extractTextFromPDF(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const pdfjs = await getPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(`Extracting page ${i}/${pdf.numPages}`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it: any) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ');
    if (pageText.trim()) text += `[Page ${i}] ${pageText.trim()}\n\n`;
  }
  return text.trim() || '(No extractable text found in this PDF)';
}

export async function extractTextFromImage(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const tesseract = await getTesseract();
  const worker = await tesseract.createWorker('eng', 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(`OCR: ${Math.round((m.progress ?? 0) * 100)}%`);
      }
    }
  });
  
  try {
    const { data: { text } } = await worker.recognize(file);
    return text.trim() || '(No text detected in this image)';
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromFile(file: File, onProgress?: (msg: string) => void): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractTextFromPDF(file, onProgress);
  } else if (file.type.startsWith('image/')) {
    return extractTextFromImage(file, onProgress);
  } else {
    // Treat as text
    return await file.text();
  }
}
