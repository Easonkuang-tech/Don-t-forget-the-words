import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useState, type FormEvent } from "react";

interface LoginPageProps {
  cloudEnabled: boolean;
  onLocalLogin: (name: string) => void;
  onCloudLogin?: (email: string, password: string) => Promise<void>;
  onCloudRegister?: (email: string, password: string) => Promise<string | void>;
}

const memorySteps = [
  { level: "L0", interval: "10 分钟", width: "18%" },
  { level: "L1", interval: "1 天", width: "28%" },
  { level: "L2", interval: "2 天", width: "38%" },
  { level: "L3", interval: "4 天", width: "50%" },
  { level: "L4", interval: "7 天", width: "64%" },
  { level: "L5", interval: "15 天", width: "80%" },
  { level: "L6", interval: "30 天", width: "100%" }
];

export function LoginPage({
  cloudEnabled,
  onLocalLogin,
  onCloudLogin,
  onCloudRegister
}: LoginPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (cloudEnabled) {
      const normalizedEmail = email.trim();
      if (!normalizedEmail.includes("@")) {
        setError("请输入有效邮箱");
        return;
      }
      if (password.length < 6) {
        setError("密码至少需要 6 个字符");
        return;
      }
      if (!onCloudLogin) {
        setError("云端登录尚未配置");
        return;
      }
      setSubmitting(true);
      try {
        await onCloudLogin(normalizedEmail, password);
      } catch (loginError) {
        setError(
          loginError instanceof Error ? loginError.message : "登录失败"
        );
      } finally {
        setSubmitting(false);
      }
    } else {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        setError("请输入至少 2 个字符的昵称");
        return;
      }
      if (password.length < 4) {
        setError("请输入至少 4 个字符的本地口令");
        return;
      }
      onLocalLogin(trimmedName);
    }
  };

  const register = async () => {
    if (!onCloudRegister) {
      return;
    }
    const normalizedEmail = email.trim();
    if (!normalizedEmail.includes("@")) {
      setError("请输入有效邮箱");
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 个字符");
      return;
    }

    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const message = await onCloudRegister(normalizedEmail, password);
      setNotice(message || "账号已创建");
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "注册失败"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>RepLoop</strong>
            <span>Search. Save. Remember.</span>
          </div>
        </div>

        <div className="login-thesis">
          <p className="eyebrow">Memory loop</p>
          <h1>让搜索过的内容，重新回到长期记忆。</h1>
          <p>
            单词、词伙和句子从词典直接进入你的卡组，再由复习间隔安排下一次出现。
          </p>
        </div>

        <div className="memory-ladder" aria-label="复习间隔层级">
          {memorySteps.map((step) => (
            <div key={step.level}>
              <span>{step.level}</span>
              <div>
                <i style={{ width: step.width }} />
              </div>
              <small>{step.interval}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="login-panel">
        <div className="login-heading">
          <span className="login-local-badge">
            <ShieldCheck size={14} />
            {cloudEnabled ? "云端同步" : "本地访问"}
          </span>
          <h2>{cloudEnabled ? "登录 RepLoop" : "进入记忆库"}</h2>
          <p>
            {cloudEnabled
              ? "同一个账号可在手机和电脑间同步学习进度。"
              : "昵称用于本地展示。口令不会离开当前设备。"}
          </p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>{cloudEnabled ? "邮箱" : "昵称"}</span>
            <div>
              <UserRound size={18} />
              {cloudEnabled ? (
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                />
              ) : (
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  placeholder="例如：Yaxley"
                  autoComplete="username"
                  autoFocus
                />
              )}
            </div>
          </label>

          <label className="login-field">
            <span>{cloudEnabled ? "密码" : "本地口令"}</span>
            <div>
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder={cloudEnabled ? "输入账号密码" : "输入本地口令"}
                autoComplete={
                  cloudEnabled ? "current-password" : "current-password"
                }
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "隐藏口令" : "显示口令"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error ? <div className="login-error">{error}</div> : null}
          {notice ? <div className="login-success">{notice}</div> : null}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting}
          >
            {submitting
              ? "正在连接..."
              : cloudEnabled
                ? "登录并同步"
                : "进入 RepLoop"}
            <ArrowRight size={18} />
          </button>

          {cloudEnabled ? (
            <button
              type="button"
              className="login-register-button"
              onClick={() => void register()}
              disabled={submitting}
            >
              创建新账号
            </button>
          ) : null}
        </form>

        <p className="login-footnote">
          {cloudEnabled
            ? "登录后数据保存在 Supabase，同一账号可在多台设备读取。"
            : "当前版本不连接账号服务器。数据仍保存在浏览器 IndexedDB。"}
        </p>
      </section>
    </main>
  );
}
