"use client";

import { UserButton } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";
import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  DietPlanResult,
  GenerationScopeValue,
  MealPlanCounts,
  OrderRecipeRequest,
  PlannerProfile,
  PreferenceValue,
  ConditionValue,
  GoalValue,
  ScheduleValue
} from "@/lib/schema";
import {
  defaultMealPlanCounts,
  getMealPlanTotal,
  normalizeMealPlanCounts,
  plannerProfileSchema
} from "@/lib/schema";

function captureClientException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
) {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    Object.entries(context?.tags || {}).forEach(([key, value]) => {
      scope.setTag(key, value);
    });

    Object.entries(context?.extra || {}).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    Sentry.captureException(normalizedError);
  });
}

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

const devOrderText = `鸡胸肉 2 盒
鸡蛋 12 枚
番茄 4 个
西兰花 2 颗
菠菜 1 把
虾仁 300g
北豆腐 2 盒
土豆 3 个
玉米 2 根
无糖酸奶 4 杯`;

const generationScopeOptions: Array<{
  counts: MealPlanCounts;
  label: string;
  description: string;
}> = [
  {
    counts: { breakfast: 0, lunch: 0, dinner: 1 },
    label: "生成一顿",
    description: "默认生成 1 顿晚餐，适合先快速试一版。"
  },
  {
    counts: { breakfast: 1, lunch: 1, dinner: 1 },
    label: "生成一天",
    description: "输出早餐、午餐、晚餐各 1 道，按顺序安排。"
  },
  {
    counts: { breakfast: 0, lunch: 2, dinner: 2 },
    label: "两天午晚餐",
    description: "适合备餐，输出 2 顿午餐和 2 顿晚餐。"
  },
  {
    counts: { breakfast: 3, lunch: 3, dinner: 3 },
    label: "三天全餐",
    description: "一次生成 9 顿，菜品会更丰富但等待稍久。"
  }
];

const mealSlots = [
  { key: "breakfast", label: "早餐", hour: 8, minute: 0, durationHours: 1 },
  { key: "lunch", label: "午餐", hour: 12, minute: 30, durationHours: 1 },
  { key: "dinner", label: "晚餐", hour: 19, minute: 0, durationHours: 1 }
] as const;

const mealCountOptions = [0, 1, 2, 3, 4] as const;

type CalendarExportTimes = {
  singleMeal: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};

function padCalendarNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatCalendarTimestamp(date: Date) {
  return `${date.getUTCFullYear()}${padCalendarNumber(date.getUTCMonth() + 1)}${padCalendarNumber(
    date.getUTCDate()
  )}T${padCalendarNumber(date.getUTCHours())}${padCalendarNumber(
    date.getUTCMinutes()
  )}${padCalendarNumber(date.getUTCSeconds())}Z`;
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function parseTimeValue(value: string, fallbackHour: number, fallbackMinute: number) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return { hour: fallbackHour, minute: fallbackMinute };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function buildCalendarFile(
  profile: PlannerProfile,
  result: DietPlanResult,
  mealPlanCounts: MealPlanCounts,
  exportTimes: CalendarExportTimes
) {
  const createdAt = new Date();
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);
  const plannedSlots = buildPlannedMealSlots(mealPlanCounts);

  const events = result.recipeSuggestions.map((recipe, index) => {
    const startAt = new Date(baseDate);
    const slot = plannedSlots[index] || {
      ...mealSlots[2],
      mealIndex: index + 1,
      dayOffset: index
    };
    const customTime =
      slot.key === "breakfast"
        ? parseTimeValue(exportTimes.breakfast, slot.hour, slot.minute)
        : slot.key === "lunch"
          ? parseTimeValue(exportTimes.lunch, slot.hour, slot.minute)
          : parseTimeValue(exportTimes.dinner, slot.hour, slot.minute);

    startAt.setDate(baseDate.getDate() + slot.dayOffset);
    startAt.setHours(customTime.hour, customTime.minute, 0, 0);

    const endAt = new Date(startAt);
    endAt.setHours(endAt.getHours() + slot.durationHours);

    const description = [
      recipe.summary,
      "",
      `适配原因：${recipe.fitReason}`,
      "",
      "用到的食材：",
      ...recipe.ingredientsToUse.map((ingredient) => `- ${ingredient}`),
      "",
      "步骤：",
      ...recipe.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
    ].join("\n");

    const owner = profile.name.trim() || "diet-agent-user";

    return [
      "BEGIN:VEVENT",
      `UID:${escapeCalendarText(`${owner}-${index + 1}-${startAt.getTime()}@diet-agent-shanghai`)}`,
      `DTSTAMP:${formatCalendarTimestamp(createdAt)}`,
      `DTSTART:${formatCalendarTimestamp(startAt)}`,
      `DTEND:${formatCalendarTimestamp(endAt)}`,
      `SUMMARY:${escapeCalendarText(`${slot.label}第 ${slot.mealIndex} 顿：${recipe.title}`)}`,
      `DESCRIPTION:${escapeCalendarText(description)}`,
      `LOCATION:${escapeCalendarText("家中厨房")}`,
      "END:VEVENT"
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Diet Agent Shanghai//Meal Plan Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeCalendarText(result.planTitle)}`,
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
}

function buildPlannedMealSlots(counts: MealPlanCounts) {
  const maxDays = Math.max(counts.breakfast, counts.lunch, counts.dinner);
  const slots: Array<(typeof mealSlots)[number] & { mealIndex: number; dayOffset: number }> = [];

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset += 1) {
    mealSlots.forEach((slot) => {
      if (dayOffset < counts[slot.key]) {
        slots.push({
          ...slot,
          mealIndex: dayOffset + 1,
          dayOffset
        });
      }
    });
  }

  return slots;
}

function getGenerationScopeFromCounts(counts: MealPlanCounts): GenerationScopeValue {
  return counts.breakfast === 1 && counts.lunch === 1 && counts.dinner === 1
    ? "full-day"
    : "single-meal";
}

function formatMealPlanSummary(counts: MealPlanCounts) {
  const parts = [
    counts.breakfast ? `${counts.breakfast} 顿早餐` : "",
    counts.lunch ? `${counts.lunch} 顿午餐` : "",
    counts.dinner ? `${counts.dinner} 顿晚餐` : ""
  ].filter(Boolean);

  return parts.length ? parts.join(" + ") : "至少选择 1 顿饭";
}

function sameMealPlanCounts(left: MealPlanCounts, right: MealPlanCounts) {
  return (
    left.breakfast === right.breakfast &&
    left.lunch === right.lunch &&
    left.dinner === right.dinner
  );
}

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

export function PlannerApp({ userId }: { userId?: string | null }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const isDevelopment = process.env.NODE_ENV === "development";
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<PlannerProfile>(initialProfile);
  const [orderImageDataUrl, setOrderImageDataUrl] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [orderText, setOrderText] = useState(isDevelopment ? devOrderText : "");
  const [mealPlanCounts, setMealPlanCounts] =
    useState<MealPlanCounts>(defaultMealPlanCounts);
  const [calendarExportTimes, setCalendarExportTimes] = useState<CalendarExportTimes>({
    singleMeal: "19:00",
    breakfast: "08:00",
    lunch: "12:30",
    dinner: "19:00"
  });
  const [result, setResult] = useState<DietPlanResult | null>(null);
  const [copiedRecipe, setCopiedRecipe] = useState<string | null>(null);
  const [calendarExported, setCalendarExported] = useState(false);
  const [showCalendarExportPanel, setShowCalendarExportPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [savedProfileMessage, setSavedProfileMessage] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("读取已保存画像失败。");
        }

        const payload = (await response.json()) as { profile?: unknown };

        if (!payload.profile) {
          setSavedProfileMessage(null);
          return;
        }

        const result = plannerProfileSchema.safeParse(payload.profile);

        if (!result.success) {
          setSavedProfileMessage(null);
          return;
        }

        setProfile(result.data);
        setSavedProfileMessage("已自动回填数据库里的用户画像。");
      } catch (error) {
        captureClientException(
          error instanceof Error ? error : new Error("读取数据库画像失败"),
          {
            tags: {
              area: "planner-app",
              action: "load-db-profile"
            }
          }
        );
        setSavedProfileMessage(null);
      } finally {
        setProfileHydrated(true);
      }
    })();
  }, [mounted, userId]);

  useEffect(() => {
    if (!mounted || !profileHydrated) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(profile)
          });

          if (!response.ok) {
            throw new Error("保存用户画像失败。");
          }

          setSavedProfileMessage("已自动保存到数据库。");
        } catch (error) {
          captureClientException(
            error instanceof Error ? error : new Error("保存数据库画像失败"),
            {
              tags: {
                area: "planner-app",
                action: "save-db-profile"
              }
            }
          );
        }
      })();
    }, 600);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [profile, mounted, profileHydrated, userId]);

  function clearSavedProfile() {
    setProfile(initialProfile);
    setSavedProfileMessage("已重置当前画像，稍后会自动同步到数据库。");
  }

  function updateMealPlanCount(meal: keyof MealPlanCounts, nextValue: number) {
    setMealPlanCounts((current) => {
      const next = normalizeMealPlanCounts({
        ...current,
        [meal]: nextValue
      });

      if (getMealPlanTotal(next) > 12) {
        return current;
      }

      return next;
    });
  }

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
    } catch (error) {
      captureClientException(error instanceof Error ? error : new Error("复制菜谱失败"), {
        tags: {
          area: "planner-app",
          action: "copy-recipe"
        },
        extra: {
          recipeTitle: recipe.title
        }
      });
      setError("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  function exportCalendar(plan: DietPlanResult) {
    try {
      const icsContent = buildCalendarFile(profile, plan, mealPlanCounts, calendarExportTimes);
      const blob = new Blob([icsContent], {
        type: "text/calendar;charset=utf-8"
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = plan.planTitle.replace(/[^\w\u4e00-\u9fa5-]+/g, "-");

      anchor.href = url;
      anchor.download = `${safeTitle || "diet-plan"}.ics`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);

      setCalendarExported(true);
      setShowCalendarExportPanel(false);
      window.setTimeout(() => setCalendarExported(false), 1800);
    } catch (error) {
      captureClientException(
        error instanceof Error ? error : new Error("导出日历失败"),
        {
          tags: {
            area: "planner-app",
            action: "export-calendar"
          }
        }
      );
      setError("导出日历失败，请稍后重试。");
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
      setSelectedFileName("");
      return;
    }

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("截图读取失败"));
        reader.readAsDataURL(file);
      });

      setOrderImageDataUrl(dataUrl);
      setSelectedFileName(file.name);
    } catch (error) {
      captureClientException(
        error instanceof Error ? error : new Error("订单截图读取失败"),
        {
          tags: {
            area: "planner-app",
            action: "read-order-image"
          },
          extra: {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size
          }
        }
      );
      setError("订单截图读取失败，请重试或直接粘贴订单文字。");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setProgressStep(0);
    setProgressMessage("正在提交订单和用户画像。");
    setError(null);

    const normalizedMealPlanCounts = normalizeMealPlanCounts(mealPlanCounts);

    try {
      const payloadBody: OrderRecipeRequest = {
        ...profile,
        orderImageDataUrl,
        orderText,
        generationScope: getGenerationScopeFromCounts(normalizedMealPlanCounts),
        mealPlanCounts: normalizedMealPlanCounts
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
      captureClientException(
        submitError instanceof Error
          ? submitError
          : new Error("生成饮食计划时发生未知错误。"),
        {
          tags: {
            area: "planner-app",
            action: "submit-plan-request"
          },
          extra: {
            hasOrderImage: Boolean(orderImageDataUrl),
            hasOrderText: Boolean(orderText.trim()),
            goals: profile.goals,
            schedule: profile.schedule
          }
        }
      );
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
      <div className="topbar">
        <div>
          <p className="eyebrow">Signed In</p>
        </div>
        {hasClerk ? <UserButton afterSignOutUrl="/sign-in" /> : null}
      </div>
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
            <div className="section-head-row">
              <div>
                <p className="section-kicker">Profile</p>
                <h2>建立用户画像</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={clearSavedProfile}
              >
                清空已记住画像
              </button>
            </div>
            {savedProfileMessage ? (
              <p className="saved-profile-text">{savedProfileMessage}</p>
            ) : null}
          </div>

          <label className="upload-field">
            <span className="upload-label">订单截图（可选）</span>
            <span className="upload-dropzone">
              <span className="upload-copy">
                <strong>上传订单截图</strong>
              <small>
                  支持常见图片格式。有购物清单时会优先识别现有食材，没有也可以直接生成菜谱和采购建议。
                </small>
              </span>
              <span className="upload-action">
                {selectedFileName ? "重新选择图片" : "选择图片"}
              </span>
              <span className="upload-meta">
                {selectedFileName || "还没有选择文件"}
              </span>
            </span>
            <input
              className="upload-input"
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
              placeholder="可以直接粘贴订单商品名；如果留空，系统会根据你的目标直接生成菜谱和建议采购清单。"
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
            <legend>生成范围</legend>
            <div className="meal-plan-presets">
              {generationScopeOptions.map((option) => (
                <button
                  type="button"
                  className={`meal-preset-button ${
                    sameMealPlanCounts(mealPlanCounts, option.counts) ? "is-selected" : ""
                  }`}
                  key={option.label}
                  onClick={() => setMealPlanCounts(option.counts)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="meal-plan-grid">
              {mealSlots.map((slot) => (
                <label className="meal-count-card" key={slot.key}>
                  <span>
                    <strong>{slot.label}</strong>
                    <small>生成 {mealPlanCounts[slot.key]} 顿</small>
                  </span>
                  <select
                    value={mealPlanCounts[slot.key]}
                    onChange={(event) =>
                      updateMealPlanCount(slot.key, Number(event.target.value))
                    }
                  >
                    {mealCountOptions.map((count) => (
                      <option value={count} key={count}>
                        {count} 顿
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="field-note">
              当前会生成 {getMealPlanTotal(mealPlanCounts)} 道菜谱：
              {formatMealPlanSummary(mealPlanCounts)}。数量越多菜品越丰富，等待时间也会略长。
            </p>
          </fieldset>

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
            <label className="select-field">
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
                    <div className="progress-marker">
                      <span className="progress-index">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="progress-content">
                      <span className="progress-status">
                        {index < progressStep ? "完成" : index === progressStep ? "处理中" : "等待"}
                      </span>
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
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    setShowCalendarExportPanel((current) => !current)
                  }
                >
                  {calendarExported
                    ? "已导出日历"
                    : showCalendarExportPanel
                      ? "收起导出设置"
                      : "导出到日历"}
                </button>
              </div>

              {showCalendarExportPanel ? (
                <section className="calendar-export-panel">
                  <div className="calendar-export-head">
                    <div>
                      <p className="surface-kicker">Calendar Export</p>
                      <h3>设置导出时间</h3>
                    </div>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => exportCalendar(result)}
                    >
                      确认导出
                    </button>
                  </div>
                  <div className="field-grid">
                    {mealPlanCounts.breakfast > 0 ? (
                      <label>
                        早餐时间
                        <input
                          type="time"
                          value={calendarExportTimes.breakfast}
                          onChange={(event) =>
                            setCalendarExportTimes((current) => ({
                              ...current,
                              breakfast: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    {mealPlanCounts.lunch > 0 ? (
                      <label>
                        午餐时间
                        <input
                          type="time"
                          value={calendarExportTimes.lunch}
                          onChange={(event) =>
                            setCalendarExportTimes((current) => ({
                              ...current,
                              lunch: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    {mealPlanCounts.dinner > 0 ? (
                      <label>
                        晚餐时间
                        <input
                          type="time"
                          value={calendarExportTimes.dinner}
                          onChange={(event) =>
                            setCalendarExportTimes((current) => ({
                              ...current,
                              dinner: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                  <p className="field-note">确认导出后，会按这里的时间写入 `.ics` 日历事件。</p>
                </section>
              ) : null}

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
                <section className="surface-block table-surface">
                  <div className="surface-head">
                    <div>
                      <p className="surface-kicker">Detected Items</p>
                      <h3>{result.recognizedItems.length ? "识别到的食材" : "现有食材"}</h3>
                    </div>
                    <span className="surface-pill">{result.recognizedItems.length} 项</span>
                  </div>
                  {result.recognizedItems.length ? (
                    result.recognizedItems.map((item) => (
                      <article className="table-row-card list-item" key={item.name}>
                        <div className="table-row-main">
                          <div>
                            <h4>{item.name}</h4>
                            <p>{item.evidence}</p>
                          </div>
                          <span className="metric-badge">置信度 {item.confidence}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="empty-copy">
                      这次没有提供购物清单，下面的菜谱会配套给出建议采购清单。
                    </p>
                  )}
                </section>

                <section className="surface-block table-surface">
                  <div className="surface-head">
                    <div>
                      <p className="surface-kicker">Shopping List</p>
                      <h3>建议采购清单</h3>
                    </div>
                    <span className="surface-pill">{result.suggestedShoppingList.length} 项</span>
                  </div>
                  {result.suggestedShoppingList.length ? (
                    result.suggestedShoppingList.map((item) => (
                      <article className="table-row-card list-item" key={`${item.name}-${item.quantity}`}>
                        <div className="table-row-main">
                          <div>
                            <h4>{item.name}</h4>
                            <p>{item.reason}</p>
                          </div>
                          <span className="metric-badge">{item.quantity}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="empty-copy">当前已有食材已经足够，暂时不需要额外采购。</p>
                  )}
                </section>
              </div>

              <section className="surface-block table-surface recipe-carousel-section">
                <div className="surface-head">
                  <div>
                    <p className="surface-kicker">Recommendations</p>
                    <h3>推荐菜谱</h3>
                  </div>
                  <span className="surface-pill">{result.recipeSuggestions.length} 道</span>
                </div>
                <div className="recipe-carousel" aria-label="可左右滚动查看推荐菜谱">
                  {result.recipeSuggestions.map((recipe, index) => (
                    <article className="recipe-card" key={recipe.title}>
                      <span className="recipe-card-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="recipe-title-row">
                        <div>
                          <h4>{recipe.title}</h4>
                          <p className="recipe-summary">{recipe.summary}</p>
                        </div>
                        <button
                          type="button"
                          className="copy-button"
                          onClick={() => void copyRecipe(recipe)}
                        >
                          {copiedRecipe === recipe.title ? "已复制" : "复制菜谱"}
                        </button>
                      </div>
                      <p className="recipe-fit-reason">{recipe.fitReason}</p>
                      <ul className="token-list">
                        {recipe.ingredientsToUse.map((ingredient) => (
                          <li key={`${recipe.title}-${ingredient}`}>{ingredient}</li>
                        ))}
                      </ul>
                      <ul className="step-list">
                        {recipe.steps.map((step) => (
                          <li key={`${recipe.title}-${step}`}>{step}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                <p className="field-note">横向滑动可以查看全部菜谱，手机上也可以直接左右划。</p>
              </section>

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
                你可以上传订单截图、粘贴购物清单，或者直接留空让 agent 按你的目标生成菜谱和建议采购清单。
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
