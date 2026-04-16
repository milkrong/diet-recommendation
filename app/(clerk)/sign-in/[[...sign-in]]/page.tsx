import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="auth-shell">
        <div className="auth-copy">
          <p className="eyebrow">Diet Agent Shanghai</p>
          <h1>还没有配置 Clerk 环境变量。</h1>
          <p className="hero-text">
            请先在部署环境或 `.env.local` 中设置 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
            和 `CLERK_SECRET_KEY`，然后再访问登录页。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-copy">
        <p className="eyebrow">Diet Agent Shanghai</p>
        <h1>登录后再让 agent 帮你识别订单和推荐菜谱。</h1>
        <p className="hero-text">
          使用 Clerk 登录后，你就可以访问买菜订单识别、流式生成和个性化菜谱推荐。
        </p>
      </div>
      <div className="auth-card">
        <SignIn />
      </div>
    </main>
  );
}
