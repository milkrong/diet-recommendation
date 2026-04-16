"use client";

import { FormEvent, useEffect, useState } from "react";
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

const goalOptions: Array<{ value: GoalValue; label: string }> = [
  { value: "fat-loss", label: "减脂" },
  { value: "muscle-gain", label: "增肌" },
  { value: "maintain", label: "维持体重" },
  { value: "blood-sugar", label: "控糖饮食" },
  { value: "high-protein", label: "高蛋白" },
  { value: "low-protein", label: "低蛋白" },
  { value: "low-fat", label: "低脂" },
  { value: "low-sodium", label: "低盐" },
  { value: "low-carb", label: "低碳水" },
  { value: "high-fiber", label: "高纤维" },
  { value: "digestive-friendly", label: "肠胃友好" }
];

const generationSteps = [
  {
    stage: "request_received",
    title: "读取订单",
    description: "正在整理你上传的截图或粘贴的订单文字。"
  },
  {
    stage: "recognition_started",
    title: "识别食材",
    description: "正在从订单中提取蔬菜、肉类、蛋白和主食。"
  },
  {
    stage: "recognition_completed",
    title: "匹配目标",
    description: "正在结合多选目标、偏好和健康限制做取舍。"
  },
  {
    stage: "recipe_started",
    title: "生成菜谱",
    description: "正在把可用食材组合成好执行的家常做法。"
  },
  {
    stage: "recipe_completed",
    title: "整理结果",
    description: "正在检查格式、步骤和风险提醒。"
  }
];

type SseProgressPayload = {
  stage: string;
  message: string;
  detail?: unknown;
};

const initialProfile: PlannerProfile = {
  name: "",
  age: "",
  goals: ["fat-loss"],
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

function toggleRequiredItem<T extends string>(items: T[], target: T) {
  if (items.includes(target)) {
    return items.length > 1 ? items.filter((item) => item !== target) : items;
  }

  return [...items, target];
}

export function PlannerApp() {
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<PlannerProfile>(initialProfile);
  const [orderImageDataUrl, setOrderImageDataUrl] = useState("");
  const [orderText, setOrderText] = useState("");
  const [result, setResult] = useState<DietPlanResult | null>(null);
  const [copiedRecipe, setCopiedRecipe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Diet Agent Shanghai</p>
            <h1>上传买菜订单截图，或粘贴订单文字，让 agent 识别你买了什么再推荐菜谱。</h1>
            <p className="hero-text">
              正在加载交互表单，马上就可以开始生成菜谱。
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
      </main>
    );
  }

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

  function updateProgress(payload: SseProgressPayload) {
    const stepIndex = generationSteps.findIndex((step) => step.stage === payload.stage);

    if (stepIndex >= 0) {
      setProgressStep(stepIndex);
    }

    if (payload.stage === "completed") {
      setProgressStep(generationSteps.length - 1);
    }

    setProgressMessage(payload.message);
  }

  function handleSseEvent(eventType: string, data: string) {
    const parsed = JSON.parse(data) as unknown;

    if (eventType === "progress") {
      updateProgress(parsed as SseProgressPayload);
      return;
    }

    if (eventType === "complete") {
      setProgressStep(generationSteps.length - 1);
      setResult(parsed as DietPlanResult);
      return;
    }

    if (eventType === "error") {
      const message =
        typeof parsed === "object" && parsed && "message" in parsed
          ? String((parsed as { message?: string }).message)
          : "推荐生成失败，请稍后重试。";
      throw new Error(message);
    }
  }

  async function consumeSseResponse(response: Response) {
    if (!response.body) {
      throw new Error("浏览器没有收到可读取的流式响应。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const eventLine = chunk
          .split("\n")
          .find((line) => line.startsWith("event:"));
        const dataLines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"));

        if (!eventLine || dataLines.length === 0) continue;

        const eventType = eventLine.replace("event:", "").trim();
        const data = dataLines
          .map((line) => line.replace("data:", "").trim())
          .join("\n");

        handleSseEvent(eventType, data);
      }
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
    setResult(null);
    setProgressStep(0);
    setProgressMessage("正在提交订单和用户画像。");
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

      const response = await fetch("/api/recommend/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadBody)
      });

      await consumeSseResponse(response);
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

          <fieldset>
            <legend>目标（可多选）</legend>
            <div className="chip-grid">
              {goalOptions.map((option) => (
                <label className="chip" key={option.value}>
                  <input
                    type="checkbox"
                    checked={profile.goals.includes(option.value)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        goals: toggleRequiredItem(current.goals, option.value)
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-grid">
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
          {loading ? (
            <div className="progress-state">
              <p className="section-kicker">Generating</p>
              <h2>正在生成菜谱</h2>
              <p>
                {progressMessage ||
                  "这个过程通常需要十几秒，订单截图越复杂会越久。下面是当前处理进度。"}
              </p>
              <div className="progress-list">
                {generationSteps.map((step, index) => (
                  <div
                    className={`progress-item ${
                      index < progressStep
                        ? "is-done"
                        : index === progressStep
                          ? "is-active"
                          : ""
                    }`}
                    key={step.title}
                  >
                    <span>{index < progressStep ? "完成" : index === progressStep ? "处理中" : "等待"}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : result ? (
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
