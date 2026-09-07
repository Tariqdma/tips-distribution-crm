import { Redirect } from "expo-router";

export default function RedirectPage() {
  return <Redirect href={"/company/daily-collections" as never} />;
}
