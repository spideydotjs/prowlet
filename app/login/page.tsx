import AuthForm from "@/components/auth-form";
import RouteFrame from "@/components/route-frame";

export default function LoginPage() {
  return (
    <RouteFrame>
      <div className="auth-layout">
        <AuthForm mode="login" />
      </div>
    </RouteFrame>
  );
}
