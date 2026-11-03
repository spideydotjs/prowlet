import AuthForm from "@/components/auth-form";
import RouteFrame from "@/components/route-frame";

export default function RegisterPage() {
  return (
    <RouteFrame>
      <div className="auth-layout">
        <AuthForm mode="register" />
      </div>
    </RouteFrame>
  );
}
