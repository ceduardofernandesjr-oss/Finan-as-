import { Suspense } from "react";
import { ResetForm } from "../auth-form";

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
