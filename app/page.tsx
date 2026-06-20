import { redirect } from "next/navigation";

// This standalone app's surface lives at /signal-room (the route the engine
// repo's tile re-points to). Root simply forwards there.
export default function Home() {
  redirect("/signal-room");
}
