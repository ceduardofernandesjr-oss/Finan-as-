import { Suspense } from "react";
import { SignupForm } from "../auth-form";

export default function Page() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
