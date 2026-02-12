import { AuthComponent } from "./sign-up";
import { Dumbbell } from "lucide-react";

const CustomLogo = () => (
  <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
    <Dumbbell className="h-4 w-4" />
  </div>
);

export default function CustomAuthDemo() {
  return (
    <AuthComponent
      mode="signup"
      logo={<CustomLogo />}
      brandName="CoachOS"
      onEmailPasswordSubmit={async () => ({ notice: "Demo mode" })}
    />
  );
}
