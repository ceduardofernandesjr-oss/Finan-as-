import { Suspense } from "react";
import { LoginForm } from "../auth-form";

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
