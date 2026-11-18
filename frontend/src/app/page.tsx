import { cookies } from "next/headers";
import { redirect } from "next/navigation";
export default async function Home() {
  const lang = (await cookies()).get("stockroom_locale")?.value;
  redirect(
    "/" +
      (lang === "so" ? "so" : "en") +
      "/dashboard" +
      (lang ? "" : "?defaultLocale=1"),
  );
}
