import { Suspense } from "react";
import { ForgotForm } from "../auth-form";

export default function Page() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
