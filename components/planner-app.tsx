"use client";

import { FormEvent, useState } from "react";
import type {
  DietPlanResult,
  OrderRecipeRequest,
  PlannerProfile,
  PreferenceValue,
  ConditionValue,
  GoalValue,
  ScheduleValue
} from "@/lib/schema";

const preferenceOptions: Array<{ value: PreferenceValue; label: string }> = [
  { value: "meat", label: "爱吃肉" },
  { value: "vegetable", label: "爱吃菜" },
  { value: "seafood", label: "爱吃海鲜" },
  { value: "spicy", label: "能吃辣" },
  { value: "light", label: "喜欢清淡" }
];

const conditionOptions: Array<{ value: ConditionValue; label: string }> = [
  { value: "diabetes", label: "糖尿病 / 血糖高" },
  { value: "hypertension", label: "高血压" },
  { value: "hyperlipidemia", label: "高血脂" },
  { value: "gout", label: "高尿酸 / 痛风" },
  { value: "lactose", label: "乳糖不耐受" }
];

const initialProfile: PlannerProfile = {
  name: "",
  age: "",
  goal: "fat-loss",
  schedule: "busy",
  preferences: ["meat"],
  conditions: [],
  trainingFrequency: "",
  notes: ""
};

function toggleItem<T extends string>(items: T[], target: T) {
  return items.includes(target)
    ? items.filter((item) => item !== target)
    : [...items, target];
}

export function PlannerApp() {
  const [profile, setProfile] = useState<PlannerProfile>(initialProfile);
  const [orderImageDataUrl, setOrderImageDataUrl] = useState("");
  const [orderText, setOrderText] = useState("");
  const [result, setResult] = useState<DietPlanResult | null>(null);
  const [copiedRecipe, setCopiedRecipe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyRecipe(recipe: DietPlanResult["recipeSuggestions"][number]) {
    const text = [
      recipe.title,
      "",
      recipe.summary,
      "",
      `适配原因：${recipe.fitReason}`,
      "",
      "用到的食材：",
      ...recipe.ingredientsToUse.map((ingredient) => `- ${ingredient}`),
      "",
      "步骤：",
      ...recipe.steps.map((step, index) => `${index + 1}. ${step}`)
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecipe(recipe.title);
      window.setTimeout(() => setCopiedRecipe(null), 1800);
    } catch {
      setError("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      setOrderImageDataUrl("");
      return;
    }

    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("截图读取失败"));
      reader.readAsDataURL(file);
    });

    setOrderImageDataUrl(dataUrl);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!orderImageDataUrl && !orderText.trim()) {
        throw new Error("请上传买菜 app 订单截图，或直接粘贴订单文字。");
      }

      const payloadBody: OrderRecipeRequest = {
        ...profile,
        orderImageDataUrl,
        orderText
      };

      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadBody)
      });

      const payload = (await response.json()) as DietPlanResult | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "推荐失败");
      }

      setResult(payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "生成饮食计划时发生未知错误。"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Diet Agent Shanghai</p>
          <h1>上传买菜订单截图，或粘贴订单文字，让 agent 识别你买了什么再推荐菜谱。</h1>
          <p className="hero-text">
            它会先识别订单里的食材，再结合你的目标、口味和健康限制，给出更贴合这批食材的家常做法。
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <span>输入</span>
            <strong>订单截图或文字 / 目标 / 偏好 / 疾病 / 训练频率</strong>
          </div>
          <div>
            <span>输出</span>
            <strong>识别到的食材 + 个性化菜谱建议</strong>
          </div>
        </div>
      </section>

      <section className="workspace">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="section-head">
            <p className="section-kicker">Profile</p>
            <h2>建立用户画像</h2>
          </div>

          <label>
            订单截图（可选）
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleFileChange(file);
              }}
            />
          </label>

          {orderImageDataUrl ? (
            <div className="upload-preview">
              <img src={orderImageDataUrl} alt="订单截图预览" />
            </div>
          ) : null}

          <label>
            订单文字（可选）
            <textarea
              rows={5}
              value={orderText}
              onChange={(event) => setOrderText(event.target.value)}
              placeholder="可以直接粘贴订单商品名，例如：鸡胸肉 1kg、番茄、鸡蛋、菠菜、土豆、虾仁..."
            />
          </label>

          <label>
            称呼
            <input
              value={profile.name}
              onChange={(event) =>
                setProfile((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="例如：Kiki"
            />
          </label>

          <div className="field-grid">
            <label>
              年龄
              <input
                value={profile.age}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, age: event.target.value }))
                }
                placeholder="例如：29"
              />
            </label>

            <label>
              每周训练频率
              <input
                value={profile.trainingFrequency}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    trainingFrequency: event.target.value
                  }))
                }
                placeholder="例如：3 次力量 + 2 次快走"
              />
            </label>
          </div>

          <div className="field-grid">
            <label>
              目标
              <select
                value={profile.goal}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    goal: event.target.value as GoalValue
                  }))
                }
              >
                <option value="fat-loss">减脂</option>
                <option value="muscle-gain">增肌</option>
                <option value="maintain">维持体重</option>
                <option value="blood-sugar">控糖饮食</option>
                <option value="high-protein">高蛋白</option>
                <option value="low-protein">低蛋白</option>
                <option value="low-fat">低脂</option>
                <option value="low-sodium">低盐</option>
                <option value="low-carb">低碳水</option>
                <option value="high-fiber">高纤维</option>
                <option value="digestive-friendly">肠胃友好</option>
              </select>
            </label>

            <label>
              日常节奏
              <select
                value={profile.schedule}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    schedule: event.target.value as ScheduleValue
                  }))
                }
              >
                <option value="busy">工作忙，想简单做</option>
                <option value="balanced">正常节奏，可做家常餐</option>
                <option value="serious">愿意认真备餐</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>饮食偏好</legend>
            <div className="chip-grid">
              {preferenceOptions.map((option) => (
                <label className="chip" key={option.value}>
                  <input
                    type="checkbox"
                    checked={profile.preferences.includes(option.value)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        preferences: toggleItem(current.preferences, option.value)
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>健康情况</legend>
            <div className="chip-grid">
              {conditionOptions.map((option) => (
                <label className="chip" key={option.value}>
                  <input
                    type="checkbox"
                    checked={profile.conditions.includes(option.value)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        conditions: toggleItem(current.conditions, option.value)
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            其他补充
            <textarea
              rows={4}
              value={profile.notes}
              onChange={(event) =>
                setProfile((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="例如：不吃牛肉、预算有限、早餐时间很紧、晚上训练后容易饿"
            />
          </label>

          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? "生成中..." : "让 Agent 推荐菜谱"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="panel result-panel">
          {result ? (
            <div className="result-stack">
              <div className="result-head">
                <div>
                  <p className="section-kicker">Agent Output</p>
                  <h2>{result.planTitle}</h2>
                  <p>{result.positioning}</p>
                </div>
              </div>

              <div className="triple-grid">
                <article className="info-block">
                  <span>目标摘要</span>
                  <strong>{result.goalSummary}</strong>
                </article>
                <article className="info-block">
                  <span>营养重点</span>
                  <strong>{result.nutritionFocus}</strong>
                </article>
                <article className="info-block">
                  <span>执行风格</span>
                  <strong>{result.executionStyle}</strong>
                </article>
              </div>

              <div className="two-grid">
                <section className="surface-block">
                  <h3>识别到的食材</h3>
                  {result.recognizedItems.map((item) => (
                    <article className="list-item" key={item.name}>
                      <h4>{item.name}</h4>
                      <p>{item.evidence}</p>
                      <small>识别置信度：{item.confidence}</small>
                    </article>
                  ))}
                </section>

                <section className="surface-block">
                  <h3>推荐菜谱</h3>
                  {result.recipeSuggestions.map((recipe) => (
                    <article className="list-item" key={recipe.title}>
                      <div className="recipe-title-row">
                        <h4>{recipe.title}</h4>
                        <button
                          type="button"
                          className="copy-button"
                          onClick={() => void copyRecipe(recipe)}
                        >
                          {copiedRecipe === recipe.title ? "已复制" : "复制菜谱"}
                        </button>
                      </div>
                      <p>{recipe.summary}</p>
                      <small>{recipe.fitReason}</small>
                      <ul>
                        {recipe.ingredientsToUse.map((ingredient) => (
                          <li key={`${recipe.title}-${ingredient}`}>{ingredient}</li>
                        ))}
                      </ul>
                      <ul>
                        {recipe.steps.map((step) => (
                          <li key={`${recipe.title}-${step}`}>{step}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </section>
              </div>

              <div className="two-grid">
                <section className="surface-block">
                  <h3>执行建议</h3>
                  <ul className="plain-list">
                    {result.executionTips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </section>

                <section className="surface-block warn-block">
                  <h3>风险提醒</h3>
                  <ul className="plain-list">
                    {result.cautions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="section-kicker">Waiting</p>
              <h2>结果还没生成</h2>
              <p>
                上传订单截图或粘贴订单文字后，服务端 agent 会先识别你买了哪些菜，再根据你的目标和限制动态推荐菜谱。
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
