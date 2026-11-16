import { BadRequestError } from "@/application/errors";
import type { DocumentTextExtractor } from "@/ports";

/** PDF via unpdf (MIT, serverless-friendly pdf.js build), DOCX via mammoth (BSD), text as-is. */
export class FileTextExtractor implements DocumentTextExtractor {
  async extract(file: Blob, fileName: string): Promise<string> {
    const name = fileName.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());

    let text: string;
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      text = (await extractText(pdf, { mergePages: true })).text;
    } else if (name.endsWith(".docx") || file.type.includes("officedocument.wordprocessingml")) {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
      text = new TextDecoder().decode(bytes);
    } else {
      throw new BadRequestError("Upload a PDF, Word (.docx) or text file.");
    }

    const clean = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (clean.length < 40) throw new BadRequestError("Couldn't read text from that file. If it's a scanned PDF, upload a text-based PDF or DOCX.");
    return clean;
  }
}
