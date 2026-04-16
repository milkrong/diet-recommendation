import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="auth-shell">
        <div className="auth-copy">
          <p className="eyebrow">Diet Agent Shanghai</p>
          <h1>还没有配置 Clerk 环境变量。</h1>
          <p className="hero-text">
            请先在部署环境或 `.env.local` 中设置 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
            和 `CLERK_SECRET_KEY`，然后再访问注册页。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-copy">
        <p className="eyebrow">Diet Agent Shanghai</p>
        <h1>创建账号后，就可以保存你的饮食目标和菜谱推荐流程。</h1>
        <p className="hero-text">
          注册完成后会自动进入应用主页，继续上传订单截图或文字生成菜谱。
        </p>
      </div>
      <div className="auth-card">
        <SignUp />
      </div>
    </main>
  );
}
