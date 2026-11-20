import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SongMeta } from "./schemas";

/**
 * Local storage for dev: web/public/generated/<id>/{audio.mp3,meta.json}, served by Next at /generated/<id>/...
 * TODO(deploy): swap for Vercel Blob (public/ is read-only on Vercel).
 */
const ROOT = path.join(process.cwd(), "public", "generated");
const ID_RE = /^[a-z0-9-]{6,40}$/;

export function newSongId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "song";
  return `${slug}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function saveSong(meta: SongMeta, audio: Buffer) {
  const dir = path.join(ROOT, meta.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, meta.audioFile), audio);
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { audioUrl: `/generated/${meta.id}/${meta.audioFile}`, metaUrl: `/generated/${meta.id}/meta.json` };
}

export async function listSongs(): Promise<SongMeta[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory() && ID_RE.test(d.name)).map((d) => d.name);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    ids.map(async (id) => {
      try {
        return JSON.parse(await readFile(path.join(ROOT, id, "meta.json"), "utf8")) as SongMeta;
      } catch {
        return null;
      }
    }),
  );
  return metas.filter((m): m is SongMeta => m !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
