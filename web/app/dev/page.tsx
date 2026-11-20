import type { Metadata } from "next";
import DevPipeline from "./DevPipeline";

export const metadata: Metadata = { title: "SongStudy · dev pipeline" };

/** Temporary test page for the notes → lyrics → song pipeline. Replaced by the real UI in Block 3. */
export default function DevPage() {
  return <DevPipeline />;
}
