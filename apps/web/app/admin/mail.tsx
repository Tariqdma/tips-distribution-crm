import { Redirect } from "expo-router";

export default function RedirectPage() {
  return <Redirect href={"/company/mail" as never} />;
}
