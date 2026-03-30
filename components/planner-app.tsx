"use client";

import { FormEvent, useState } from "react";
import type {
  DietPlanResult,
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
  const [result, setResult] = useState<DietPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profile)
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
          <h1>把你的目标、口味与健康限制，交给一个会规划饮食的 agent。</h1>
          <p className="hero-text">
            这不是写死模板，而是由模型根据用户画像动态生成饮食策略、三餐方向、执行提醒与上海山姆采购清单。
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <span>输入</span>
            <strong>目标 / 偏好 / 疾病 / 训练频率</strong>
          </div>
          <div>
            <span>输出</span>
            <strong>结构化饮食计划 + 山姆采购建议</strong>
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
            {loading ? "生成中..." : "让 Agent 生成饮食计划"}
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
                <div className="badge">{result.planMode}</div>
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
                  <h3>三餐与加餐建议</h3>
                  {result.meals.map((meal) => (
                    <article className="list-item" key={meal.name}>
                      <h4>{meal.name}</h4>
                      <p>{meal.strategy}</p>
                      <small>{meal.example}</small>
                    </article>
                  ))}
                </section>

                <section className="surface-block">
                  <h3>上海山姆购物清单</h3>
                  {result.shoppingCategories.map((category) => (
                    <article className="list-item" key={category.category}>
                      <h4>{category.category}</h4>
                      <ul>
                        {category.items.map((item) => (
                          <li key={`${category.category}-${item.name}`}>
                            <strong>{item.name}</strong>
                            <span>{item.reason}</span>
                          </li>
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
                填完左侧表单后，服务端 agent 会根据你的目标和限制动态组织推荐内容，而不是返回一份写死的模板。
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
