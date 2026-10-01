import {
  Bell,
  Check,
  Cloud,
  Database,
  Download,
  HardDrive,
  LogOut,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  clearDatabase,
  db,
  exportSnapshot,
  importSnapshot,
  updateSettings
} from "../lib/db";
import { dateKey } from "../lib/format";
import type { AppSettings } from "../types";

interface DictionaryStatus {
  source: "seed" | "ecdict";
  entryCount: number;
  fullDictionary: boolean;
}

interface ProfilePageProps {
  userName: string;
  userEmail?: string;
  cloudMode: boolean;
  onLogout: () => void;
}

export function ProfilePage({
  userName,
  userEmail,
  cloudMode,
  onLogout
}: ProfilePageProps) {
  const settings = useLiveQuery(() => db.settings.get("app"));
  const projectCount = useLiveQuery(() => db.projects.count(), [], 0) ?? 0;
  const deckCount = useLiveQuery(() => db.decks.count(), [], 0) ?? 0;
  const cardCount = useLiveQuery(() => db.cards.count(), [], 0) ?? 0;
  const logCount = useLiveQuery(() => db.reviewLogs.count(), [], 0) ?? 0;
  const [dictionaryStatus, setDictionaryStatus] =
    useState<DictionaryStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [importStrategy, setImportStrategy] = useState<"merge" | "replace">(
    "merge"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/dictionary/status")
      .then((response) => response.json())
      .then(setDictionaryStatus)
      .catch(() => setDictionaryStatus(null));
  }, []);

  useEffect(() => {
    if (!settings?.notificationEnabled || !("Notification" in window)) {
      return;
    }

    const checkNotification = () => {
      const now = new Date();
      const current = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;
      const storageKey = `english-memory-notified-${dateKey(now)}`;
      if (
        current >= settings.notificationTime &&
        localStorage.getItem(storageKey) !== "1" &&
        Notification.permission === "granted"
      ) {
        new Notification("今日复习时间", {
          body: "打开 RepLoop，完成今天到期的英语卡片。",
          tag: "english-memory-daily"
        });
        localStorage.setItem(storageKey, "1");
      }
    };

    checkNotification();
    const interval = window.setInterval(checkNotification, 30_000);
    return () => window.clearInterval(interval);
  }, [settings?.notificationEnabled, settings?.notificationTime]);

  const saveSettings = async (changes: Partial<AppSettings>) => {
    await updateSettings(changes);
  };

  const toggleNotification = async () => {
    if (!settings) {
      return;
    }
    if (!("Notification" in window)) {
      setNotice("当前浏览器不支持本地通知");
      return;
    }

    if (!settings.notificationEnabled) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotice("浏览器没有授予通知权限");
        return;
      }
    }

    await saveSettings({ notificationEnabled: !settings.notificationEnabled });
    setNotice(
      settings.notificationEnabled ? "已关闭学习提醒" : "已开启学习提醒"
    );
  };

  const handleExport = async () => {
    const snapshot = await exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `RepLoop-备份-${dateKey(Date.now())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("备份已导出");
  };

  const handleImport = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text());
      if (
        importStrategy === "replace" &&
        !window.confirm("覆盖导入会删除当前全部数据，是否继续？")
      ) {
        return;
      }
      await importSnapshot(payload, importStrategy);
      setNotice("数据导入完成");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入失败");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">本地空间</p>
          <h1>我的</h1>
        </div>
        <span className="local-badge">
          {cloudMode ? <Cloud size={15} /> : <WifiOff size={15} />}
          {cloudMode ? "Cloud" : "Local"}
        </span>
      </header>

      <section className="profile-hero">
        <div className="profile-mark">
          <HardDrive size={26} />
        </div>
        <div>
          <strong>{userName} 的记忆库</strong>
          <p>
            {cloudMode
              ? userEmail || "账号已连接 Supabase"
              : "数据只保存在当前浏览器，不上传云端。"}
          </p>
        </div>
        <button
          type="button"
          className="icon-button profile-logout"
          onClick={() => {
            if (
              window.confirm(
                cloudMode
                  ? "退出登录？云端数据不会被删除。"
                  : "退出登录？本地词库不会被删除。"
              )
            ) {
              onLogout();
            }
          }}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut size={18} />
        </button>
      </section>

      <section className="settings-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">今日计划</p>
            <h2>每日新卡</h2>
          </div>
        </header>
        <SegmentedControl
          value={String(settings?.dailyNewLimit ?? 10)}
          ariaLabel="每日新卡数量"
          options={[
            { value: "10", label: "10" },
            { value: "20", label: "20" },
            { value: "35", label: "35" },
            { value: "50", label: "50" },
            { value: "80", label: "80" }
          ]}
          onChange={(value) =>
            void saveSettings({
              dailyNewLimit: Number(value) as AppSettings["dailyNewLimit"]
            })
          }
        />
      </section>

      <section className="settings-section">
        <button
          type="button"
          className="setting-row"
          onClick={() => void toggleNotification()}
        >
          <span className="setting-icon">
            <Bell size={18} />
          </span>
          <span className="setting-copy">
            <strong>学习通知</strong>
            <small>浏览器打开时按设置时间提醒</small>
          </span>
          <span
            className={`toggle ${settings?.notificationEnabled ? "is-on" : ""}`}
            aria-hidden="true"
          >
            <span />
          </span>
        </button>
        <label className="setting-row">
          <span className="setting-icon">
            <span className="time-glyph">时</span>
          </span>
          <span className="setting-copy">
            <strong>提醒时间</strong>
            <small>使用本地时区</small>
          </span>
          <input
            type="time"
            value={settings?.notificationTime ?? "09:30"}
            onChange={(event) =>
              void saveSettings({ notificationTime: event.target.value })
            }
          />
        </label>
      </section>

      <section className="settings-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">数据</p>
            <h2>备份与恢复</h2>
          </div>
        </header>
        <div className="data-summary">
          <div>
            <strong>{projectCount}</strong>
            <span>项目</span>
          </div>
          <div>
            <strong>{deckCount}</strong>
            <span>卡组</span>
          </div>
          <div>
            <strong>{cardCount}</strong>
            <span>卡片</span>
          </div>
          <div>
            <strong>{logCount}</strong>
            <span>记录</span>
          </div>
        </div>
        <div className="import-strategy">
          <span>导入方式</span>
          <SegmentedControl
            value={importStrategy}
            ariaLabel="导入方式"
            options={[
              { value: "merge", label: "合并" },
              { value: "replace", label: "覆盖" }
            ]}
            onChange={setImportStrategy}
          />
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleExport()}
          >
            <Download size={17} />
            导出备份
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={17} />
            导入备份
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleImport(file);
            }
          }}
        />
      </section>

      <section className="settings-section">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">词典</p>
            <h2>离线能力</h2>
          </div>
        </header>
        <div className="status-row">
          <span className="setting-icon">
            <Database size={18} />
          </span>
          <span className="setting-copy">
            <strong>
              {dictionaryStatus?.fullDictionary ? "ECDICT 完整词典" : "内置样例词典"}
            </strong>
            <small>
              {dictionaryStatus
                ? `${dictionaryStatus.entryCount.toLocaleString("zh-CN")} 条词条`
                : "正在读取词典状态"}
            </small>
          </span>
          {dictionaryStatus?.fullDictionary ? (
            <Check size={18} className="status-ok" />
          ) : (
            <ShieldCheck size={18} className="status-neutral" />
          )}
        </div>
        <p className="setting-footnote">
          完整词典可通过项目命令安装，安装后单词查询完全离线。
        </p>
      </section>

      <section className="danger-zone">
        <div>
          <strong>清空本地数据</strong>
          <p>删除全部项目、卡片和学习记录，无法撤销。</p>
        </div>
        <button
          type="button"
          className="danger-button"
          onClick={async () => {
            if (window.confirm("确定清空全部本地数据？请先导出备份。")) {
              await clearDatabase();
              setNotice("本地数据已清空");
            }
          }}
        >
          <Trash2 size={16} />
          清空
        </button>
      </section>

      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
