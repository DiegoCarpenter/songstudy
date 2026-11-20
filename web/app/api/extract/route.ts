import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { MAX_NOTES_CHARS } from "@/lib/schemas";


const MAX_BYTES = 10 * 1024 * 1024;
const TextBody = z.object({ text: z.string().min(1).max(MAX_NOTES_CHARS) });

/** PDF / .md / .txt upload (multipart "file") or JSON { text } → { text, chars }. */
export async function POST(req: Request) {
  try {
    const type = req.headers.get("content-type") ?? "";
    let text: string;

    if (type.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return err("Attach a file in the 'file' field.", 400);
      if (file.size > MAX_BYTES) return err("File is over 10 MB.", 413);
      const name = file.name.toLowerCase();
      const buf = Buffer.from(await file.arrayBuffer());

      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const parser = new PDFParse({ data: buf });
        try {
          text = (await parser.getText()).text;
        } finally {
          await parser.destroy();
        }
      } else if (/\.(md|markdown|txt)$/.test(name) || file.type.startsWith("text/")) {
        text = buf.toString("utf8");
      } else {
        return err("Upload a PDF, .md, or .txt file.", 415);
      }
    } else {
      const parsed = TextBody.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return err("Send { text } or a file.", 400);
      text = parsed.data.text;
    }

    text = clean(text);
    if (text.length < 40) return err("Couldn't find much text in that file. Is it a scanned image?", 422);
    if (text.length > MAX_NOTES_CHARS) return err("That's a lot of notes! Trim to one lecture or chapter.", 413);
    return NextResponse.json({ text, chars: text.length });
  } catch (e) {
    console.error("[extract]", e);
    return err("Couldn't read that file.", 500);
  }
}

function clean(s: string) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/-- \d+ of \d+ --/g, "") // pdf-parse page markers
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const err = (error: string, status: number) => NextResponse.json({ error }, { status });
