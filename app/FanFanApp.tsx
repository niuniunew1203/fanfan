"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { AppState, Meal, MealType, NutritionItem } from "./lib/types";

const PERSONAS = [
  { id: "demo-lin", name: "小林", role: "家庭创建者", avatar: "/avatars/lin.jpg" },
  { id: "demo-mum", name: "妈妈", role: "擅长家常菜", avatar: "/avatars/mum.jpg" },
  { id: "demo-chen", name: "阿辰", role: "认真吃饭的人", avatar: "/avatars/chen.jpg" },
];

const MEAL_META: Record<MealType, { label: string; time: string; icon: string }> = {
  breakfast: { label: "早餐", time: "06:00–10:30", icon: "☀" },
  lunch: { label: "午餐", time: "11:00–14:30", icon: "◐" },
  dinner: { label: "晚餐", time: "17:00–21:30", icon: "☾" },
};

const EMPTY_STATE: AppState = { user: null, group: null, members: [], meals: [] };

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function friendlyDate(value: string) {
  if (value === localDate()) return "今天";
  if (value === localDate(-1)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "操作没有完成，请稍后重试");
  return data;
}

export function FanFanApp() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"home" | "upload" | "family" | "profile">("home");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    const next = await api<AppState>("/api/app-state");
    setState(next);
    setSelectedMeal((current) => current ? next.meals.find((meal) => meal.id === current.id) ?? null : null);
  }, []);

  useEffect(() => {
    let active = true;
    api<AppState>("/api/app-state").then((next) => { if (active) setState(next); }).catch((error) => { if (active) setToast(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);

  async function login(userId: string) {
    setLoading(true);
    try { await api("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) }); await refresh(); }
    catch (error) { setToast((error as Error).message); }
    finally { setLoading(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setState(EMPTY_STATE); setSelectedMeal(null); setTab("home");
  }

  if (loading) return <LoadingScreen />;
  if (!state.user) return <LoginScreen onLogin={login} />;
  if (!state.group) return <GroupOnboarding onDone={refresh} />;

  return (
    <div className="site-shell">
      <div className="desktop-rail" aria-hidden="true">
        <div className="rail-mark"><span>饭</span></div>
        <p>记录三餐<br/>也记录相聚</p>
        <div className="rail-stamp">FANFAN<br/>DIARY</div>
      </div>
      <main className="app-frame">
        {tab === "home" && <HomeView state={state} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onOpen={setSelectedMeal} onUpload={() => setTab("upload")} />}
        {tab === "upload" && <UploadView onDone={async (mealId) => { await refresh(); setTab("home"); setSelectedMeal(state.meals.find((meal) => meal.id === mealId) ?? null); setToast("这顿饭已经记下，AI 正在分析"); }} onAnalyzed={refresh} />}
        {tab === "family" && <FamilyView state={state} onRefresh={refresh} onToast={setToast} />}
        {tab === "profile" && <ProfileView state={state} onLogout={logout} onSwitch={logout} />}
        <BottomNav active={tab} onChange={setTab} />
      </main>
      {selectedMeal && <MealSheet key={`${selectedMeal.id}-${selectedMeal.analysisStatus}-${selectedMeal.analysis?.totals.caloriesKcal}-${selectedMeal.note}`} meal={selectedMeal} onClose={() => setSelectedMeal(null)} onRefresh={refresh} onToast={setToast} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="bowl-loader"><span>饭</span></div><p>正在盛饭…</p></div>;
}

function LoginScreen({ onLogin }: { onLogin: (id: string) => void }) {
  const [chosen, setChosen] = useState(PERSONAS[0].id);
  return (
    <main className="login-page">
      <div className="login-art"><div className="sun-disc"/><div className="steam s1"/><div className="steam s2"/><div className="hero-bowl"><span>饭</span></div><p className="vertical-copy">一日三餐<br/>四季相伴</p></div>
      <section className="login-panel">
        <div className="brand-lockup"><div className="brand-seal">饭</div><div><h1>饭饭日记</h1><p>把每顿饭，记成家的日常</p></div></div>
        <div className="demo-notice"><span>体验版</span> 本页面使用演示身份，不会连接真实微信账号</div>
        <h2>选择一个身份进入</h2>
        <div className="persona-list">
          {PERSONAS.map((person) => <button key={person.id} className={`persona-card ${chosen === person.id ? "selected" : ""}`} onClick={() => setChosen(person.id)} aria-pressed={chosen === person.id}>
            <img src={person.avatar} alt=""/><span><strong>{person.name}</strong><small>{person.role}</small></span><i>{chosen === person.id ? "✓" : ""}</i>
          </button>)}
        </div>
        <button className="primary-button wechat-button" onClick={() => onLogin(chosen)}><span>微</span>微信登录（演示）</button>
        <p className="login-footnote">正式版将通过微信网页授权安全获取头像与昵称</p>
      </section>
    </main>
  );
}

function HomeView({ state, selectedDate, setSelectedDate, onOpen, onUpload }: { state: AppState; selectedDate: string; setSelectedDate: (date: string) => void; onOpen: (meal: Meal) => void; onUpload: () => void }) {
  const dayMeals = state.meals.filter((meal) => meal.mealDate === selectedDate);
  const calories = dayMeals.reduce((sum, meal) => sum + (meal.analysis?.totals.caloriesKcal ?? 0), 0);
  function shift(days: number) { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + days); setSelectedDate(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`); }
  return <div className="view home-view">
    <header className="topbar"><div><p className="eyebrow">{state.group?.name} · {state.members.length} 位成员</p><h1>今天，吃了什么？</h1></div><div className="avatar-stack">{state.members.slice(0,3).map((member) => <img key={member.id} src={member.avatarUrl} alt={member.displayName}/>)}</div></header>
    <section className="date-strip"><button onClick={() => shift(-1)} aria-label="前一天">‹</button><div><strong>{friendlyDate(selectedDate)}</strong><span>{selectedDate.replaceAll("-", " · ")}</span></div><button onClick={() => shift(1)} aria-label="后一天" disabled={selectedDate >= localDate()}>›</button></section>
    <section className="day-summary"><div><span className="summary-kicker">今日已记录</span><strong>{dayMeals.length}<small> / {state.members.length * 3} 餐</small></strong></div><div className="summary-line"/><div><span className="summary-kicker">全家总计</span><strong>{Math.round(calories)}<small> kcal</small></strong></div><div className="grain-dot dot-one"/><div className="grain-dot dot-two"/></section>
    <div className="meal-timeline">
      {(Object.keys(MEAL_META) as MealType[]).map((type) => {
        const meals = dayMeals.filter((meal) => meal.mealType === type);
        const meta = MEAL_META[type];
        return <section className="meal-section" key={type}><div className="meal-heading"><div className="meal-icon">{meta.icon}</div><div><h2>{meta.label}</h2><p>{meta.time}</p></div><span>{meals.length ? `${meals.length} 人已记录` : "还没有记录"}</span></div>
          {meals.length ? <div className="meal-grid">{meals.map((meal) => <MealCard key={meal.id} meal={meal} onClick={() => onOpen(meal)}/>)}</div> : <button className="empty-meal" onClick={onUpload}><span>＋</span><div><strong>记下这顿饭</strong><small>拍一张照片，留住今天的味道</small></div></button>}
        </section>;
      })}
    </div>
    <p className="nutrition-disclaimer">AI 营养结果仅为图片估算，不能替代营养师或医疗建议。</p>
  </div>;
}

function MealCard({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  const kcal = meal.analysis?.totals.caloriesKcal;
  return <button className="meal-card" onClick={onClick}>
    <div className="meal-photo"><img src={meal.imageUrl} alt={meal.note || `${MEAL_META[meal.mealType].label}照片`}/><span className={`analysis-pill ${meal.analysisStatus}`}>{meal.analysisStatus === "confirmed" ? "AI 已确认" : meal.analysisStatus === "draft" ? "待确认" : meal.analysisStatus === "failed" ? "分析失败" : "AI 分析中"}</span></div>
    <div className="meal-body"><div className="author-row"><img src={meal.author.avatarUrl} alt=""/><strong>{meal.author.displayName}</strong><time>{new Date(`${meal.createdAt.replace(" ", "T")}Z`).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div>
      <p>{meal.note || "这一餐没有留下文字，只留下了好味道。"}</p>
      <div className="nutrition-mini"><span><b>{kcal ? Math.round(kcal) : "—"}</b> kcal</span><span>蛋白 {meal.analysis ? Math.round(meal.analysis.totals.proteinG) : "—"}g</span><i>查看详情 →</i></div>
    </div>
  </button>;
}

function UploadView({ onDone, onAnalyzed }: { onDone: (mealId: string) => Promise<void>; onAnalyzed: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [mealType, setMealType] = useState<MealType>(() => { const hour = new Date().getHours(); return hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner"; });
  const [mealDate, setMealDate] = useState(localDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(next: File | null) { setError(""); if (!next) return; if (!["image/jpeg","image/png","image/webp"].includes(next.type)) return setError("请选择 JPEG、PNG 或 WebP 图片"); if (next.size > 10*1024*1024) return setError("图片不能超过 10 MB"); if (preview) URL.revokeObjectURL(preview); setFile(next); setPreview(URL.createObjectURL(next)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return setError("先拍下或选择一张餐食照片吧"); setBusy(true); setError("");
    try { const form = new FormData(); form.set("image", file); form.set("mealDate", mealDate); form.set("mealType", mealType); form.set("note", note); const created = await api<{ mealId: string }>("/api/meals", { method: "POST", body: form }); await onDone(created.mealId); api(`/api/meals/${created.mealId}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(onAnalyzed).catch(onAnalyzed); }
    catch (nextError) { setError((nextError as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="view upload-view"><header className="simple-header"><p className="eyebrow">留住此刻</p><h1>记下这顿饭</h1><p>一张照片，就是今天最具体的记忆。</p></header>
    <form onSubmit={submit} className="upload-form">
      <button type="button" className={`photo-picker ${preview ? "has-photo" : ""}`} onClick={() => inputRef.current?.click()}>{preview ? <img src={preview} alt="待上传餐食"/> : <><span className="camera-icon">◎</span><strong>拍照或选择照片</strong><small>支持 JPEG、PNG、WebP · 最大 10 MB</small></>}<i>{preview ? "更换照片" : ""}</i></button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => choose(event.target.files?.[0] ?? null)}/>
      <fieldset><legend>这是哪一餐？</legend><div className="segment-control">{(Object.keys(MEAL_META) as MealType[]).map((type) => <button type="button" key={type} className={mealType === type ? "active" : ""} onClick={() => setMealType(type)}><span>{MEAL_META[type].icon}</span>{MEAL_META[type].label}</button>)}</div></fieldset>
      <label className="field"><span>日期</span><input type="date" max={localDate()} value={mealDate} onChange={(event) => setMealDate(event.target.value)} required/></label>
      <label className="field"><span>说两句 <small>选填</small></span><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0,200))} placeholder="比如：妈妈今天做了我最爱的番茄炒蛋…" rows={3}/><i>{note.length}/200</i></label>
      <div className="ai-preview"><div className="ai-orb">AI</div><div><strong>上传后自动估算营养</strong><p>识别食物与份量，计算热量、蛋白质、碳水等。结果会先由你确认。</p></div></div>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存并开始分析"}</button>
    </form>
  </div>;
}

function FamilyView({ state, onRefresh, onToast }: { state: AppState; onRefresh: () => Promise<void>; onToast: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function copyCode() { const code = state.group?.inviteCode; if (!code) return; await navigator.clipboard?.writeText(code); onToast("邀请码已复制，可以发给家人了"); }
  async function rotate() { setBusy(true); try { await api("/api/groups/invite/rotate", { method: "POST" }); await onRefresh(); onToast("已生成新的邀请码"); } catch (error) { onToast((error as Error).message); } finally { setBusy(false); } }
  return <div className="view family-view"><header className="simple-header"><p className="eyebrow">一起吃饭的人</p><h1>{state.group?.name}</h1><p>生活各自忙碌，饭桌让我们常常见面。</p></header>
    <section className="family-hero"><div className="family-monogram">家</div><div><span>家庭相册</span><strong>{state.members.length} 位成员 · {state.meals.length} 顿饭</strong></div></section>
    <section className="panel"><div className="panel-title"><h2>家庭成员</h2><span>{state.members.length} 人</span></div><div className="member-list">{state.members.map((member, index) => <div className="member-row" key={member.id}><img src={member.avatarUrl} alt=""/><div><strong>{member.displayName}{member.id === state.user?.id && <small> 我</small>}</strong><p>{index === 0 ? "创建了这个家" : "一起记录三餐"}</p></div><span>{index === 0 ? "组长" : "成员"}</span></div>)}</div></section>
    <section className="invite-card"><p>邀请家人加入</p>{state.group?.role === "owner" ? <><div className="invite-code"><strong>{state.group.inviteCode}</strong><button onClick={copyCode}>复制</button></div><small>让家人在“加入家庭”中输入这个邀请码</small><button className="text-button" onClick={rotate} disabled={busy}>{busy ? "正在更新…" : "旧码泄露了？生成新邀请码"}</button></> : <div className="member-invite-note">向家庭创建者索取邀请码，可邀请更多家人加入。</div>}</section>
    <section className="privacy-note"><span>⌂</span><div><strong>只有家人能看到</strong><p>餐食图片通过成员身份校验后加载，不会生成公开图片链接。</p></div></section>
  </div>;
}

function ProfileView({ state, onLogout, onSwitch }: { state: AppState; onLogout: () => void; onSwitch: () => void }) {
  const mine = state.meals.filter((meal) => meal.author.id === state.user?.id);
  return <div className="view profile-view"><header className="profile-header"><img src={state.user?.avatarUrl} alt=""/><div><span className="demo-chip">演示身份</span><h1>{state.user?.displayName}</h1><p>已和家人记录 {mine.length} 顿饭</p></div></header>
    <section className="profile-stats"><div><strong>{mine.length}</strong><span>餐食记录</span></div><div><strong>{mine.filter((meal) => meal.analysisStatus === "confirmed").length}</strong><span>营养分析</span></div><div><strong>{new Set(mine.map((meal) => meal.mealDate)).size}</strong><span>记录天数</span></div></section>
    <section className="panel profile-menu"><button><span>◉</span><div><strong>微信授权</strong><small>正式版接入后可同步真实头像昵称</small></div><i>待接入</i></button><button><span>?</span><div><strong>关于营养估算</strong><small>了解 AI 结果的范围与限制</small></div><i>›</i></button><button onClick={onSwitch}><span>↻</span><div><strong>切换演示身份</strong><small>体验其他家庭成员的视角</small></div><i>›</i></button></section>
    <button className="logout-button" onClick={onLogout}>退出当前身份</button><p className="version-note">饭饭日记 · MVP 体验版</p>
  </div>;
}

function BottomNav({ active, onChange }: { active: string; onChange: (tab: "home"|"upload"|"family"|"profile") => void }) {
  const items = [{ id:"home",icon:"⌂",label:"首页"},{id:"family",icon:"♢",label:"家庭"},{id:"profile",icon:"○",label:"我的"}] as const;
  return <nav className="bottom-nav"><div className="nav-inner">{items.slice(0,1).map((item) => <NavItem key={item.id} {...item} active={active === item.id} onClick={() => onChange(item.id)}/>)}<NavItem {...items[1]} active={active === items[1].id} onClick={() => onChange(items[1].id)}/><button className={`add-meal-button ${active === "upload" ? "active" : ""}`} onClick={() => onChange("upload")} aria-label="上传餐食"><span>＋</span></button><NavItem {...items[2]} active={active === items[2].id} onClick={() => onChange(items[2].id)}/></div></nav>;
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span><small>{label}</small></button>; }

function MealSheet({ meal, onClose, onRefresh, onToast }: { meal: Meal; onClose: () => void; onRefresh: () => Promise<void>; onToast: (text: string) => void }) {
  const [note, setNote] = useState(meal.note);
  const [items, setItems] = useState<NutritionItem[]>(meal.analysis?.items ?? []);
  const [busy, setBusy] = useState(false);
  async function action(task: () => Promise<unknown>, message: string) { setBusy(true); try { await task(); await onRefresh(); onToast(message); } catch (error) { onToast((error as Error).message); } finally { setBusy(false); } }
  async function saveNote() { return action(() => api(`/api/meals/${meal.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({note}) }), "文字已经更新"); }
  async function analyze() { return action(() => api(`/api/meals/${meal.id}/analyze`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({corrections:items}) }), "营养结果已重新计算"); }
  async function confirmAnalysis() { return action(() => api(`/api/meals/${meal.id}/confirm-analysis`, { method:"POST" }), "营养结果已确认"); }
  async function remove() { if (!window.confirm("确定删除这顿饭吗？照片和营养结果也会一起删除。")) return; await action(() => api(`/api/meals/${meal.id}`, { method:"DELETE" }), "餐食记录已删除"); onClose(); }
  const totals = meal.analysis?.totals;
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><article className="meal-sheet"><button className="sheet-close" onClick={onClose} aria-label="关闭">×</button><div className="sheet-photo"><img src={meal.imageUrl} alt="餐食详情"/><div><img src={meal.author.avatarUrl} alt=""/><span><strong>{meal.author.displayName}的{MEAL_META[meal.mealType].label}</strong><small>{friendlyDate(meal.mealDate)}</small></span></div></div>
    <div className="sheet-content">{meal.canEdit ? <label className="sheet-note"><span>这一餐的故事</span><textarea value={note} onChange={(event)=>setNote(event.target.value.slice(0,200))} rows={2}/>{note !== meal.note && <button onClick={saveNote} disabled={busy}>保存文字</button>}</label> : <p className="sheet-story">{meal.note}</p>}
      {meal.analysis ? <section className="analysis-card"><div className="analysis-title"><div><span>AI 营养估算</span><h2>{Math.round(totals?.caloriesKcal ?? 0)} <small>kcal</small></h2></div><span className={meal.analysis.source === "demo" ? "demo-source" : "live-source"}>{meal.analysis.source === "demo" ? "演示数据" : "AI 分析"}</span></div><div className="macro-grid"><Macro label="蛋白质" value={totals?.proteinG}/><Macro label="碳水" value={totals?.carbsG}/><Macro label="脂肪" value={totals?.fatG}/><Macro label="膳食纤维" value={totals?.fiberG}/></div>
        <div className="food-items"><h3>识别到的食物</h3>{items.map((item,index)=><div className="food-row" key={`${item.name}-${index}`}><span className={`confidence ${item.confidence}`}/>{meal.canEdit && !meal.analysis?.confirmed ? <><input value={item.name} onChange={(event)=>setItems(items.map((current,i)=>i===index?{...current,name:event.target.value}:current))}/><label><input type="number" min="1" max="3000" value={item.estimatedGrams} onChange={(event)=>setItems(items.map((current,i)=>i===index?{...current,estimatedGrams:Number(event.target.value)}:current))}/> g</label></> : <><strong>{item.name}</strong><span>{Math.round(item.estimatedGrams)} g</span></>}</div>)}</div>
        <p className="analysis-comment">{meal.analysis.comment}</p><p className="analysis-caveat">⚠ {meal.analysis.caveat}</p>
        {meal.canEdit && !meal.analysis.confirmed && <div className="analysis-actions"><button className="secondary-button" onClick={analyze} disabled={busy}>重新计算</button><button className="primary-button compact" onClick={confirmAnalysis} disabled={busy}>确认结果</button></div>}
      </section> : <section className="analysis-wait"><div className="ai-orb">AI</div><div><strong>{meal.analysisStatus === "failed" ? "分析没有完成" : "正在读懂这顿饭"}</strong><p>{meal.analysisStatus === "failed" ? "可以点击重试，餐食记录不会受影响。" : "通常需要几秒钟，请稍等一下。"}</p>{meal.canEdit && meal.analysisStatus === "failed" && <button onClick={analyze} disabled={busy}>重新分析</button>}</div></section>}
      <p className="sheet-disclaimer">营养数据为图片估算，仅供饮食记录参考，不能替代专业医疗建议。</p>{meal.canEdit && <button className="delete-button" onClick={remove} disabled={busy}>删除这顿饭</button>}
    </div></article></div>;
}

function Macro({ label, value }: { label: string; value?: number }) { return <div><span>{label}</span><strong>{value === undefined ? "—" : Math.round(value)}<small> g</small></strong></div>; }

function GroupOnboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [mode,setMode]=useState<"join"|"create">("join"); const [value,setValue]=useState(""); const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setError("");try{await api(mode==="join"?"/api/groups/join":"/api/groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mode==="join"?{code:value}:{name:value})});await onDone();}catch(next){setError((next as Error).message)}}
  return <main className="onboarding"><div className="brand-seal large">家</div><h1>{mode==="join"?"加入家人的饭桌":"创建一个家庭"}</h1><p>{mode==="join"?"输入家人发给你的 8 位邀请码":"给这个共同的饭桌起一个名字"}</p><form onSubmit={submit}><input value={value} onChange={(event)=>setValue(event.target.value)} placeholder={mode==="join"?"例如 FANFAN88":"例如 我们家"} maxLength={20} autoFocus/>{error&&<p className="form-error">{error}</p>}<button className="primary-button">{mode==="join"?"加入家庭":"创建家庭"}</button></form><button className="text-button" onClick={()=>{setMode(mode==="join"?"create":"join");setValue("");setError("")}}>{mode==="join"?"还没有家庭？创建一个":"已有邀请码？加入家庭"}</button></main>;
}
