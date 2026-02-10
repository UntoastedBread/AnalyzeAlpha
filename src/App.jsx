import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Area
} from "recharts";
import { supabase, hasSupabaseConfig } from "./supabaseClient";
import "./App.css";

// ═══════════════════════════════════════════════════════════
// DATA LAYER — Local proxy to Yahoo Finance
// ═══════════════════════════════════════════════════════════
let apiCallCount = 0;
let lastApiLatency = 0;
const CHART_ANIM_MS = 650;
const INTERVAL_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "60m": 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const WORKSPACE_STORAGE_KEY = "aa_workspace_v1";
const WORKSPACE_VERSION = 1;
const LANG_STORAGE_KEY = "aa_lang_v1";

const LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "fr-FR", label: "Français (France)" },
  { code: "de-DE", label: "Deutsch (Deutschland)" },
  { code: "hi-IN", label: "हिन्दी (भारत)" },
  { code: "id-ID", label: "Indonesia (Indonesia)" },
  { code: "it-IT", label: "Italiano (Italia)" },
  { code: "ja-JP", label: "日本語 (日本)" },
  { code: "ko-KR", label: "한국어 (대한민국)" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "es-419", label: "Español (Latinoamérica)" },
  { code: "es-ES", label: "Español (España)" },
];

const TRANSLATIONS = {
  "en-US": {
    "tagline.quant": "Quantitative Analysis",
    "search.placeholder": "Search stocks...",
    "search.running": "Running…",
    "search.analyze": "Analyze",
    "nav.home": "Home",
    "nav.analysis": "Analysis",
    "nav.charts": "Charts",
    "nav.heatmap": "Heatmap",
    "nav.comparison": "Comparison",
    "nav.account": "Account",
    "nav.help": "Help",
    "menu.settings": "Settings",
    "menu.language": "Language",
    "menu.upgrade": "Upgrade to Pro",
    "menu.gift": "Gift AnalyzeAlpha",
    "menu.logout": "Log out",
    "menu.signedOut": "Not signed in",
    "chart.openCharts": "Open in Charts",
    "help.title": "Help Mode",
    "help.body": "Hover any highlighted element to learn what it does. Click Help again to exit.",
    "help.exit": "Exit Help",
    "pro.heatmap.title": "Heatmap Is Pro",
    "pro.heatmap.desc": "Unlock the S&P heatmap with live Sharpe, volatility, and relative performance.",
    "pro.heatmap.f0": "Parallel data fetches",
    "pro.heatmap.f1": "Treemap visualization",
    "pro.heatmap.f2": "Risk and regime overlays",
    "pro.comparison.title": "Comparison Is Pro",
    "pro.comparison.desc": "Compare multiple tickers across signals, risk, and valuation in one view.",
    "pro.comparison.f0": "Side-by-side signal scores",
    "pro.comparison.f1": "Sharpe and drawdown rankings",
    "pro.comparison.f2": "Export-ready table view",
    "footer.disclaimer": "For educational purposes only — not financial advice",
  },
  "fr-FR": {
    "tagline.quant": "Analyse quantitative",
    "search.placeholder": "Rechercher des actions...",
    "search.running": "En cours…",
    "search.analyze": "Analyser",
    "nav.home": "Accueil",
    "nav.analysis": "Analyse",
    "nav.charts": "Graphiques",
    "nav.heatmap": "Carte thermique",
    "nav.comparison": "Comparaison",
    "nav.account": "Compte",
    "nav.help": "Aide",
    "menu.settings": "Paramètres",
    "menu.language": "Langue",
    "menu.upgrade": "Passer à Pro",
    "menu.gift": "Offrir AnalyzeAlpha",
    "menu.logout": "Se déconnecter",
    "menu.signedOut": "Non connecté",
    "chart.openCharts": "Ouvrir dans Graphiques",
    "help.title": "Mode d'aide",
    "help.body": "Survolez un élément en surbrillance pour voir ce qu'il fait. Cliquez sur Aide à nouveau pour quitter.",
    "help.exit": "Quitter l'aide",
    "pro.heatmap.title": "La carte thermique est Pro",
    "pro.heatmap.desc": "Déverrouillez la carte thermique du S&P avec Sharpe, volatilité et performance relative en temps réel.",
    "pro.heatmap.f0": "Récupérations de données parallèles",
    "pro.heatmap.f1": "Visualisation en treemap",
    "pro.heatmap.f2": "Superpositions de risque et de régime",
    "pro.comparison.title": "La comparaison est Pro",
    "pro.comparison.desc": "Comparez plusieurs tickers selon les signaux, le risque et la valorisation dans une seule vue.",
    "pro.comparison.f0": "Scores de signaux côte à côte",
    "pro.comparison.f1": "Classements Sharpe et drawdown",
    "pro.comparison.f2": "Vue tableau prête à l'export",
    "footer.disclaimer": "À des fins éducatives uniquement — ceci n'est pas un conseil financier",
  },
  "de-DE": {
    "tagline.quant": "Quantitative Analyse",
    "search.placeholder": "Aktien suchen...",
    "search.running": "Läuft…",
    "search.analyze": "Analysieren",
    "nav.home": "Startseite",
    "nav.analysis": "Analyse",
    "nav.charts": "Charts",
    "nav.heatmap": "Heatmap",
    "nav.comparison": "Vergleich",
    "nav.account": "Konto",
    "nav.help": "Hilfe",
    "menu.settings": "Einstellungen",
    "menu.language": "Sprache",
    "menu.upgrade": "Auf Pro upgraden",
    "menu.gift": "AnalyzeAlpha verschenken",
    "menu.logout": "Abmelden",
    "menu.signedOut": "Nicht angemeldet",
    "chart.openCharts": "In Charts öffnen",
    "help.title": "Hilfemodus",
    "help.body": "Fahre über markierte Elemente, um zu sehen, was sie tun. Klicke erneut auf Hilfe, um zu beenden.",
    "help.exit": "Hilfe beenden",
    "pro.heatmap.title": "Heatmap ist Pro",
    "pro.heatmap.desc": "Schalte die S&P-Heatmap mit live Sharpe, Volatilität und relativer Performance frei.",
    "pro.heatmap.f0": "Parallele Datenabrufe",
    "pro.heatmap.f1": "Treemap-Visualisierung",
    "pro.heatmap.f2": "Risiko- und Regime-Overlays",
    "pro.comparison.title": "Vergleich ist Pro",
    "pro.comparison.desc": "Vergleiche mehrere Ticker über Signale, Risiko und Bewertung in einer Ansicht.",
    "pro.comparison.f0": "Signal-Scores nebeneinander",
    "pro.comparison.f1": "Sharpe- und Drawdown-Rankings",
    "pro.comparison.f2": "Exportfertige Tabellenansicht",
    "footer.disclaimer": "Nur zu Bildungszwecken — keine Finanzberatung",
  },
  "hi-IN": {
    "tagline.quant": "मात्रात्मक विश्लेषण",
    "search.placeholder": "स्टॉक्स खोजें...",
    "search.running": "चल रहा है…",
    "search.analyze": "विश्लेषण करें",
    "nav.home": "होम",
    "nav.analysis": "विश्लेषण",
    "nav.charts": "चार्ट",
    "nav.heatmap": "हीटमैप",
    "nav.comparison": "तुलना",
    "nav.account": "अकाउंट",
    "nav.help": "सहायता",
    "menu.settings": "सेटिंग्स",
    "menu.language": "भाषा",
    "menu.upgrade": "प्रो में अपग्रेड करें",
    "menu.gift": "AnalyzeAlpha उपहार दें",
    "menu.logout": "लॉग आउट",
    "menu.signedOut": "साइन इन नहीं है",
    "chart.openCharts": "चार्ट्स में खोलें",
    "help.title": "सहायता मोड",
    "help.body": "हाइलाइट किए गए तत्वों पर होवर करें ताकि उनका मतलब समझें। बाहर निकलने के लिए सहायता पर फिर क्लिक करें।",
    "help.exit": "सहायता बंद करें",
    "pro.heatmap.title": "हीटमैप प्रो है",
    "pro.heatmap.desc": "लाइव शार्प, वोलैटिलिटी और रिलेटिव परफॉर्मेंस के साथ S&P हीटमैप अनलॉक करें।",
    "pro.heatmap.f0": "समानांतर डेटा फेच",
    "pro.heatmap.f1": "ट्रीमैप विज़ुअलाइज़ेशन",
    "pro.heatmap.f2": "रिस्क और रेजीम ओवरले",
    "pro.comparison.title": "तुलना प्रो है",
    "pro.comparison.desc": "एक ही दृश्य में कई टिकर्स को संकेत, जोखिम और मूल्यांकन के अनुसार तुलना करें।",
    "pro.comparison.f0": "साइड-बाय-साइड सिग्नल स्कोर",
    "pro.comparison.f1": "शार्प और ड्रॉडाउन रैंकिंग",
    "pro.comparison.f2": "एक्सपोर्ट-रेडी टेबल व्यू",
    "footer.disclaimer": "केवल शैक्षिक उद्देश्यों के लिए — यह वित्तीय सलाह नहीं है",
  },
  "id-ID": {
    "tagline.quant": "Analisis kuantitatif",
    "search.placeholder": "Cari saham...",
    "search.running": "Memproses…",
    "search.analyze": "Analisis",
    "nav.home": "Beranda",
    "nav.analysis": "Analisis",
    "nav.charts": "Grafik",
    "nav.heatmap": "Peta panas",
    "nav.comparison": "Perbandingan",
    "nav.account": "Akun",
    "nav.help": "Bantuan",
    "menu.settings": "Pengaturan",
    "menu.language": "Bahasa",
    "menu.upgrade": "Upgrade ke Pro",
    "menu.gift": "Hadiahkan AnalyzeAlpha",
    "menu.logout": "Keluar",
    "menu.signedOut": "Belum masuk",
    "chart.openCharts": "Buka di Grafik",
    "help.title": "Mode Bantuan",
    "help.body": "Arahkan kursor ke elemen yang disorot untuk melihat fungsinya. Klik Bantuan lagi untuk keluar.",
    "help.exit": "Keluar Bantuan",
    "pro.heatmap.title": "Peta panas adalah Pro",
    "pro.heatmap.desc": "Buka peta panas S&P dengan Sharpe, volatilitas, dan kinerja relatif secara langsung.",
    "pro.heatmap.f0": "Pengambilan data paralel",
    "pro.heatmap.f1": "Visualisasi treemap",
    "pro.heatmap.f2": "Overlay risiko dan rezim",
    "pro.comparison.title": "Perbandingan adalah Pro",
    "pro.comparison.desc": "Bandingkan beberapa ticker berdasarkan sinyal, risiko, dan valuasi dalam satu tampilan.",
    "pro.comparison.f0": "Skor sinyal berdampingan",
    "pro.comparison.f1": "Peringkat Sharpe dan drawdown",
    "pro.comparison.f2": "Tampilan tabel siap ekspor",
    "footer.disclaimer": "Hanya untuk tujuan edukasi — bukan nasihat keuangan",
  },
  "it-IT": {
    "tagline.quant": "Analisi quantitativa",
    "search.placeholder": "Cerca titoli...",
    "search.running": "In esecuzione…",
    "search.analyze": "Analizza",
    "nav.home": "Home",
    "nav.analysis": "Analisi",
    "nav.charts": "Grafici",
    "nav.heatmap": "Mappa termica",
    "nav.comparison": "Confronto",
    "nav.account": "Account",
    "nav.help": "Aiuto",
    "menu.settings": "Impostazioni",
    "menu.language": "Lingua",
    "menu.upgrade": "Passa a Pro",
    "menu.gift": "Regala AnalyzeAlpha",
    "menu.logout": "Esci",
    "menu.signedOut": "Non connesso",
    "chart.openCharts": "Apri in Grafici",
    "help.title": "Modalità Aiuto",
    "help.body": "Passa il mouse sugli elementi evidenziati per vedere cosa fanno. Fai clic su Aiuto di nuovo per uscire.",
    "help.exit": "Esci da Aiuto",
    "pro.heatmap.title": "La mappa termica è Pro",
    "pro.heatmap.desc": "Sblocca la mappa termica dell'S&P con Sharpe, volatilità e performance relativa in tempo reale.",
    "pro.heatmap.f0": "Recuperi dati paralleli",
    "pro.heatmap.f1": "Visualizzazione treemap",
    "pro.heatmap.f2": "Sovrapposizioni di rischio e regime",
    "pro.comparison.title": "Il confronto è Pro",
    "pro.comparison.desc": "Confronta più ticker per segnali, rischio e valutazione in un'unica vista.",
    "pro.comparison.f0": "Punteggi dei segnali affiancati",
    "pro.comparison.f1": "Classifiche Sharpe e drawdown",
    "pro.comparison.f2": "Vista tabella pronta per l'esportazione",
    "footer.disclaimer": "Solo a scopo educativo — non è consulenza finanziaria",
  },
  "ja-JP": {
    "tagline.quant": "定量分析",
    "search.placeholder": "株式を検索...",
    "search.running": "実行中…",
    "search.analyze": "分析する",
    "nav.home": "ホーム",
    "nav.analysis": "分析",
    "nav.charts": "チャート",
    "nav.heatmap": "ヒートマップ",
    "nav.comparison": "比較",
    "nav.account": "アカウント",
    "nav.help": "ヘルプ",
    "menu.settings": "設定",
    "menu.language": "言語",
    "menu.upgrade": "Pro にアップグレード",
    "menu.gift": "AnalyzeAlpha を贈る",
    "menu.logout": "ログアウト",
    "menu.signedOut": "サインインしていません",
    "chart.openCharts": "チャートで開く",
    "help.title": "ヘルプモード",
    "help.body": "ハイライトされた要素にカーソルを合わせると説明が表示されます。終了するにはもう一度ヘルプをクリックします。",
    "help.exit": "ヘルプを終了",
    "pro.heatmap.title": "ヒートマップは Pro です",
    "pro.heatmap.desc": "ライブのシャープ、ボラティリティ、相対パフォーマンスで S&P ヒートマップを解放。",
    "pro.heatmap.f0": "並列データ取得",
    "pro.heatmap.f1": "ツリーマップ可視化",
    "pro.heatmap.f2": "リスクとレジームのオーバーレイ",
    "pro.comparison.title": "比較は Pro です",
    "pro.comparison.desc": "複数のティッカーをシグナル、リスク、バリュエーションで一括比較。",
    "pro.comparison.f0": "シグナルスコアの並列表示",
    "pro.comparison.f1": "シャープとドローダウンのランキング",
    "pro.comparison.f2": "エクスポート可能な表表示",
    "footer.disclaimer": "教育目的のみ — 金融助言ではありません",
  },
  "ko-KR": {
    "tagline.quant": "정량 분석",
    "search.placeholder": "종목 검색...",
    "search.running": "실행 중…",
    "search.analyze": "분석",
    "nav.home": "홈",
    "nav.analysis": "분석",
    "nav.charts": "차트",
    "nav.heatmap": "히트맵",
    "nav.comparison": "비교",
    "nav.account": "계정",
    "nav.help": "도움말",
    "menu.settings": "설정",
    "menu.language": "언어",
    "menu.upgrade": "Pro로 업그레이드",
    "menu.gift": "AnalyzeAlpha 선물하기",
    "menu.logout": "로그아웃",
    "menu.signedOut": "로그인되지 않음",
    "chart.openCharts": "차트에서 열기",
    "help.title": "도움말 모드",
    "help.body": "강조 표시된 요소에 마우스를 올리면 설명이 표시됩니다. 종료하려면 도움말을 다시 클릭하세요.",
    "help.exit": "도움말 종료",
    "pro.heatmap.title": "히트맵은 Pro입니다",
    "pro.heatmap.desc": "실시간 샤프, 변동성, 상대 성과로 S&P 히트맵을 잠금 해제합니다.",
    "pro.heatmap.f0": "병렬 데이터 가져오기",
    "pro.heatmap.f1": "트리맵 시각화",
    "pro.heatmap.f2": "리스크 및 레짐 오버레이",
    "pro.comparison.title": "비교는 Pro입니다",
    "pro.comparison.desc": "여러 티커를 신호, 리스크, 가치평가로 한 화면에서 비교합니다.",
    "pro.comparison.f0": "나란한 신호 점수",
    "pro.comparison.f1": "샤프 및 드로다운 순위",
    "pro.comparison.f2": "내보내기용 테이블 보기",
    "footer.disclaimer": "교육 목적 전용 — 금융 조언이 아닙니다",
  },
  "pt-BR": {
    "tagline.quant": "Análise quantitativa",
    "search.placeholder": "Pesquisar ações...",
    "search.running": "Processando…",
    "search.analyze": "Analisar",
    "nav.home": "Início",
    "nav.analysis": "Análise",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparação",
    "nav.account": "Conta",
    "nav.help": "Ajuda",
    "menu.settings": "Configurações",
    "menu.language": "Idioma",
    "menu.upgrade": "Atualizar para Pro",
    "menu.gift": "Presentear AnalyzeAlpha",
    "menu.logout": "Sair",
    "menu.signedOut": "Não conectado",
    "chart.openCharts": "Abrir em Gráficos",
    "help.title": "Modo de Ajuda",
    "help.body": "Passe o mouse sobre os elementos destacados para ver o que eles fazem. Clique em Ajuda novamente para sair.",
    "help.exit": "Sair da Ajuda",
    "pro.heatmap.title": "Mapa de calor é Pro",
    "pro.heatmap.desc": "Desbloqueie o mapa de calor do S&P com Sharpe, volatilidade e desempenho relativo ao vivo.",
    "pro.heatmap.f0": "Coletas de dados paralelas",
    "pro.heatmap.f1": "Visualização em treemap",
    "pro.heatmap.f2": "Sobreposições de risco e regime",
    "pro.comparison.title": "Comparação é Pro",
    "pro.comparison.desc": "Compare vários tickers por sinais, risco e valuation em uma única visualização.",
    "pro.comparison.f0": "Pontuações de sinais lado a lado",
    "pro.comparison.f1": "Rankings de Sharpe e drawdown",
    "pro.comparison.f2": "Visão de tabela pronta para exportação",
    "footer.disclaimer": "Apenas para fins educacionais — não é aconselhamento financeiro",
  },
  "es-419": {
    "tagline.quant": "Análisis cuantitativo",
    "search.placeholder": "Buscar acciones...",
    "search.running": "Ejecutando…",
    "search.analyze": "Analizar",
    "nav.home": "Inicio",
    "nav.analysis": "Análisis",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparación",
    "nav.account": "Cuenta",
    "nav.help": "Ayuda",
    "menu.settings": "Configuración",
    "menu.language": "Idioma",
    "menu.upgrade": "Mejorar a Pro",
    "menu.gift": "Regalar AnalyzeAlpha",
    "menu.logout": "Cerrar sesión",
    "menu.signedOut": "No has iniciado sesión",
    "chart.openCharts": "Abrir en Gráficos",
    "help.title": "Modo de Ayuda",
    "help.body": "Pasa el cursor sobre los elementos resaltados para ver qué hacen. Haz clic en Ayuda otra vez para salir.",
    "help.exit": "Salir de Ayuda",
    "pro.heatmap.title": "El mapa de calor es Pro",
    "pro.heatmap.desc": "Desbloquea el mapa de calor del S&P con Sharpe, volatilidad y rendimiento relativo en vivo.",
    "pro.heatmap.f0": "Obtención de datos en paralelo",
    "pro.heatmap.f1": "Visualización treemap",
    "pro.heatmap.f2": "Superposiciones de riesgo y régimen",
    "pro.comparison.title": "La comparación es Pro",
    "pro.comparison.desc": "Compara varios tickers por señales, riesgo y valoración en una sola vista.",
    "pro.comparison.f0": "Puntuaciones de señales lado a lado",
    "pro.comparison.f1": "Clasificaciones de Sharpe y drawdown",
    "pro.comparison.f2": "Vista de tabla lista para exportar",
    "footer.disclaimer": "Solo con fines educativos — no es asesoramiento financiero",
  },
  "es-ES": {
    "tagline.quant": "Análisis cuantitativo",
    "search.placeholder": "Buscar acciones...",
    "search.running": "Ejecutando…",
    "search.analyze": "Analizar",
    "nav.home": "Inicio",
    "nav.analysis": "Análisis",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparación",
    "nav.account": "Cuenta",
    "nav.help": "Ayuda",
    "menu.settings": "Ajustes",
    "menu.language": "Idioma",
    "menu.upgrade": "Actualizar a Pro",
    "menu.gift": "Regalar AnalyzeAlpha",
    "menu.logout": "Cerrar sesión",
    "menu.signedOut": "No has iniciado sesión",
    "chart.openCharts": "Abrir en Gráficos",
    "help.title": "Modo de Ayuda",
    "help.body": "Pasa el cursor por los elementos resaltados para ver qué hacen. Haz clic en Ayuda otra vez para salir.",
    "help.exit": "Salir de Ayuda",
    "pro.heatmap.title": "El mapa de calor es Pro",
    "pro.heatmap.desc": "Desbloquea el mapa de calor del S&P con Sharpe, volatilidad y rendimiento relativo en vivo.",
    "pro.heatmap.f0": "Obtención de datos en paralelo",
    "pro.heatmap.f1": "Visualización treemap",
    "pro.heatmap.f2": "Superposiciones de riesgo y régimen",
    "pro.comparison.title": "La comparación es Pro",
    "pro.comparison.desc": "Compara varios tickers por señales, riesgo y valoración en una sola vista.",
    "pro.comparison.f0": "Puntuaciones de señales en paralelo",
    "pro.comparison.f1": "Clasificaciones de Sharpe y drawdown",
    "pro.comparison.f2": "Vista de tabla lista para exportar",
    "footer.disclaimer": "Solo con fines educativos — no es asesoramiento financiero",
  },
};

function emptyWorkspace() {
  return {
    version: WORKSPACE_VERSION,
    watchlist: [],
    alerts: [],
    recent: [],
    comparisons: [],
    prefs: {
      period: "1y",
      interval: "1d",
      region: "Global",
      updatedAt: Date.now(),
    },
  };
}

function sanitizeWorkspace(data) {
  if (!data || typeof data !== "object") return emptyWorkspace();
  const base = emptyWorkspace();
  return {
    version: WORKSPACE_VERSION,
    watchlist: Array.isArray(data.watchlist) ? data.watchlist : base.watchlist,
    alerts: Array.isArray(data.alerts) ? data.alerts : base.alerts,
    recent: Array.isArray(data.recent) ? data.recent : base.recent,
    comparisons: Array.isArray(data.comparisons) ? data.comparisons : base.comparisons,
    prefs: {
      ...base.prefs,
      ...(data.prefs && typeof data.prefs === "object" ? data.prefs : {}),
    },
  };
}

function loadLocalWorkspace() {
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    return sanitizeWorkspace(JSON.parse(raw));
  } catch {
    return emptyWorkspace();
  }
}

function saveLocalWorkspace(data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota or access errors
  }
}

function formatAgo(ts) {
  if (!ts) return "just now";
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function getFirstNameFromUser(user) {
  const meta = user?.user_metadata || {};
  const raw = meta.first_name || meta.firstName || meta.name || meta.full_name || meta.fullName || "";
  if (!raw) return "";
  return String(raw).trim().split(/\s+/)[0];
}

function shortRegimeLabel(regime) {
  if (!regime) return "UNKNOWN";
  return String(regime).replace(/STRONG_/g, "").replace(/TRENDING_/g, "").replace(/_/g, " ");
}

function mergeUnique(primary, secondary, keyFn) {
  const seen = new Set();
  const merged = [];
  [...primary, ...secondary].forEach((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function mergeWorkspaces(local, remote) {
  const a = sanitizeWorkspace(local);
  const b = sanitizeWorkspace(remote);
  const prefs = (a.prefs?.updatedAt || 0) >= (b.prefs?.updatedAt || 0) ? a.prefs : b.prefs;
  return {
    version: WORKSPACE_VERSION,
    watchlist: mergeUnique(a.watchlist, b.watchlist, (w) => w.ticker),
    alerts: mergeUnique(a.alerts, b.alerts, (al) => `${al.ticker}|${al.type}|${al.value}`),
    recent: mergeUnique(a.recent, b.recent, (r) => `${r.ticker}|${r.ts || r.timestamp || ""}`),
    comparisons: mergeUnique(a.comparisons, b.comparisons, (c) => c?.id || c?.key || JSON.stringify(c)),
    prefs,
  };
}

function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

function formatDateLabel(ts, interval) {
  const iso = new Date(ts * 1000).toISOString();
  const day = iso.slice(0, 10);
  if (interval && interval !== "1d") {
    return `${day} ${iso.slice(11, 16)}`;
  }
  return day;
}

function parseDateLabel(label) {
  if (!label) return null;
  if (label.includes("T")) return new Date(label);
  if (label.length === 10) return new Date(`${label}T00:00:00Z`);
  if (label.includes(" ")) return new Date(label.replace(" ", "T") + "Z");
  return new Date(label);
}

function applyLivePoint(data, livePrice, interval) {
  if (!data || !data.length || livePrice == null) return data || [];
  const ms = INTERVAL_MS[interval] || 0;
  if (!ms || ms >= INTERVAL_MS["1d"]) return data;
  const last = data[data.length - 1];
  const lastTime = parseDateLabel(last.date);
  if (!lastTime || Number.isNaN(lastTime.getTime())) return data;
  const now = Date.now();
  const bucket = Math.floor(now / ms) * ms;
  if (bucket <= lastTime.getTime()) return data;
  const label = formatDateLabel(Math.floor(bucket / 1000), interval);
  const open = last.Close;
  const high = Math.max(open, livePrice);
  const low = Math.min(open, livePrice);
  return [...data, { ...last, date: label, Open: open, High: high, Low: low, Close: livePrice }];
}

async function fetchStockData(ticker, period = "1y", interval = "1d") {
  const debug = { attempts: [], ticker, period, interval, timestamp: new Date().toISOString() };
  const t0 = performance.now();

  // Via local Express proxy (no CORS issues)
  try {
    const s = performance.now();
    const url = `/api/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
    const json = await resp.json();
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response structure");
    const q = r.indicators.quote[0];
    const data = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
      if (c == null || o == null) continue;
      data.push({
        date: formatDateLabel(r.timestamp[i], interval),
        Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
        Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
      });
    }
    const minPoints = interval === "1d" ? 10 : 5;
    if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
    const lat = Math.round(performance.now() - s);
    debug.attempts.push({ source: "local-proxy", status: "success", latency: lat, points: data.length });
    return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
  } catch (e) {
    debug.attempts.push({ source: "local-proxy", status: "failed", error: e.message });
  }

  // Fallback: CORS proxy (dev only)
  if (!import.meta.env.PROD) {
    try {
      const s = performance.now();
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&includePrePost=false`;
      const resp = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`);
      if (!resp.ok) throw new Error(`CORS proxy HTTP ${resp.status}`);
      const json = await resp.json();
      const r = json?.chart?.result?.[0];
      if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response");
      const q = r.indicators.quote[0];
      const data = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
        if (c == null || o == null) continue;
        data.push({
          date: formatDateLabel(r.timestamp[i], interval),
          Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
          Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
        });
      }
      const minPoints = interval === "1d" ? 10 : 5;
      if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
      const lat = Math.round(performance.now() - s);
      debug.attempts.push({ source: "cors-proxy", status: "success", latency: lat, points: data.length });
      return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
    } catch (e) {
      debug.attempts.push({ source: "cors-proxy", status: "failed", error: e.message });
    }
  } else {
    debug.attempts.push({ source: "cors-proxy", status: "skipped", reason: "disabled in production" });
  }

  debug.totalTime = Math.round(performance.now() - t0);
  const err = new Error(`All data sources failed for ${ticker}`);
  err.debug = debug;
  throw err;
}

async function fetchQuickQuote(ticker) {
  const t0 = performance.now();
  apiCallCount++;
  const url = `/api/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  lastApiLatency = Math.round(performance.now() - t0);
  const r = json?.chart?.result?.[0];
  if (!r?.meta) throw new Error("Bad response");
  const meta = r.meta;
  const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
  const volumes = r.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
  const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : price);
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const volume = volumes[volumes.length - 1] || 0;
  return { ticker, price, change, changePct, volume, name: meta.shortName || meta.symbol || ticker, spark: closes.slice(-30), prevClose };
}

async function fetchIntradayData(ticker) {
  const t0 = performance.now();
  apiCallCount++;
  const url = `/api/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  lastApiLatency = Math.round(performance.now() - t0);
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("Bad response");
  const q = r.indicators.quote[0];
  const prevClose = r.meta?.chartPreviousClose ?? r.meta?.previousClose ?? q.close?.[0] ?? 0;
  const points = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    const d = new Date(r.timestamp[i] * 1000);
    points.push({ time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, price: +c.toFixed(2) });
  }
  const lastPrice = points.length ? points[points.length - 1].price : prevClose;
  return { points, prevClose, lastPrice, isUp: lastPrice >= prevClose };
}

async function fetchMarketMovers(universe) {
  const uni = universe || HEATMAP_UNIVERSE;
  const results = await Promise.allSettled(uni.map(s => fetchQuickQuote(s.ticker)));
  const quotes = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.filter(s => s.changePct > 0);
  const losers = [...quotes].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0);
  const mostActive = [...quotes].sort((a, b) => b.volume - a.volume);
  return { gainers, losers, mostActive };
}

async function fetchRSSNews() {
  try {
    const resp = await fetchWithTimeout("/api/rss");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.items && json.items.length > 0) return json.items.slice(0, 20);
    return FALLBACK_NEWS;
  } catch {
    return FALLBACK_NEWS;
  }
}

async function fetchTickerStrip(symbols) {
  const syms = symbols || TICKER_STRIP_SYMBOLS;
  const results = await Promise.allSettled(
    syms.map(s => fetchQuickQuote(s.symbol))
  );
  return syms.map((s, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      return { ...s, price: r.value.price, change: r.value.change, changePct: r.value.changePct, loaded: true };
    }
    return { ...s, price: 0, change: 0, changePct: 0, loaded: false };
  });
}

async function fetchSearch(query) {
  if (!query || query.length < 1) return [];
  const resp = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`, {}, 5000);
  if (!resp.ok) return [];
  const json = await resp.json();
  return json.quotes || [];
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════
function calcReturns(d) {
  return d.map((v, i) => {
    if (i === 0) return { ...v, Returns: 0, LogReturns: 0 };
    const ret = (v.Close - d[i - 1].Close) / d[i - 1].Close;
    return { ...v, Returns: ret, LogReturns: Math.log(v.Close / d[i - 1].Close) };
  });
}

function calcSMA(c, w) {
  return c.map((_, i) => i < w - 1 ? null : c.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
}

function calcEMA(c, s) {
  const k = 2 / (s + 1), e = [c[0]];
  for (let i = 1; i < c.length; i++) e.push(c[i] * k + e[i - 1] * (1 - k));
  return e;
}

function calcRSI(c, p = 14) {
  const r = new Array(c.length).fill(null);
  for (let i = 1; i < c.length; i++) {
    if (i < p) continue;
    let g = 0, l = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = c[j] - c[j - 1];
      if (d > 0) g += d; else l -= d;
    }
    const ag = g / p, al = l / p;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcMACD(c, f = 12, s = 26, sg = 9) {
  const ef = calcEMA(c, f), es = calcEMA(c, s);
  const m = ef.map((v, i) => v - es[i]), si = calcEMA(m, sg);
  return { macd: m, signal: si, histogram: m.map((v, i) => v - si[i]) };
}

function calcBB(c, p = 20, n = 2) {
  return c.map((_, i) => {
    if (i < p - 1) return { upper: null, middle: null, lower: null };
    const sl = c.slice(i - p + 1, i + 1);
    const m = sl.reduce((a, b) => a + b, 0) / p;
    const st = Math.sqrt(sl.reduce((a, v) => a + (v - m) ** 2, 0) / p);
    return { upper: m + n * st, middle: m, lower: m - n * st };
  });
}

function calcATR(d, p = 14) {
  const tr = d.map((v, i) => {
    if (i === 0) return v.High - v.Low;
    return Math.max(v.High - v.Low, Math.abs(v.High - d[i - 1].Close), Math.abs(v.Low - d[i - 1].Close));
  });
  return calcSMA(tr, p);
}

function calcStoch(d, kP = 14, dP = 3) {
  const k = d.map((_, i) => {
    if (i < kP - 1) return null;
    const sl = d.slice(i - kP + 1, i + 1);
    const lo = Math.min(...sl.map(x => x.Low)), hi = Math.max(...sl.map(x => x.High));
    return hi === lo ? 50 : 100 * (d[i].Close - lo) / (hi - lo);
  });
  return { k, d: calcSMA(k.map(v => v ?? 50), dP) };
}

function calcADX(d, p = 14) {
  const di = [], dm = [], adx = [];
  for (let i = 0; i < d.length; i++) {
    if (i < p) { di.push(null); dm.push(null); adx.push(null); continue; }
    let ts = 0, dp = 0, dn = 0;
    for (let j = i - p + 1; j <= i; j++) {
      ts += Math.max(d[j].High - d[j].Low, Math.abs(d[j].High - d[j - 1].Close), Math.abs(d[j].Low - d[j - 1].Close));
      const u = d[j].High - d[j - 1].High, dd = d[j - 1].Low - d[j].Low;
      dp += (u > dd && u > 0) ? u : 0;
      dn += (dd > u && dd > 0) ? dd : 0;
    }
    const dip = ts > 0 ? 100 * dp / ts : 0, dim = ts > 0 ? 100 * dn / ts : 0;
    di.push(dip); dm.push(dim);
    adx.push((dip + dim) > 0 ? 100 * Math.abs(dip - dim) / (dip + dim) : 0);
  }
  return { diPlus: di, diMinus: dm, adx };
}

function detectTrend(data, w = 50) {
  const c = data.map(d => d.Close), n = Math.min(w, c.length), r = c.slice(-n);
  const xm = (n - 1) / 2, ym = r.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (r[i] - ym); den += (i - xm) ** 2; }
  const sl = den ? num / den : 0, ns = (sl / ym) * 100;
  const ssTot = r.reduce((a, v) => a + (v - ym) ** 2, 0);
  const ssRes = r.reduce((a, v, i) => a + (v - (sl * i + (ym - sl * xm))) ** 2, 0);
  const rSq = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const s20 = calcSMA(c, 20), s50 = calcSMA(c, 50);
  const ma = (s20[s20.length - 1] || 0) > (s50[s50.length - 1] || 0) ? "UPTREND" : "DOWNTREND";
  let dir = "SIDEWAYS";
  if (ns > 0.1 && ma === "UPTREND") dir = "UPTREND";
  else if (ns < -0.1 && ma === "DOWNTREND") dir = "DOWNTREND";
  return { direction: dir, strength: Math.min(100, Math.abs(ns) * 10 * rSq), slope: ns, rSquared: rSq, maAlignment: ma, confidence: rSq };
}

function classifyVol(data, w = 20) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < w + 2) return { current: 0, average: 0, ratio: 1, classification: "NORMAL" };
  const rc = ret.slice(-w), m0 = rc.reduce((a, b) => a + b, 0) / rc.length;
  const std = Math.sqrt(rc.reduce((a, v) => a + (v - m0) ** 2, 0) / rc.length);
  const cv = std * Math.sqrt(252) * 100;
  const all = [];
  for (let i = w; i <= ret.length; i++) {
    const s = ret.slice(i - w, i), m = s.reduce((a, b) => a + b, 0) / s.length;
    all.push(Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / s.length));
  }
  const av = all.length > 0 ? (all.reduce((a, b) => a + b, 0) / all.length) * Math.sqrt(252) * 100 : cv;
  const ratio = av > 0 ? cv / av : 1;
  let cls = "NORMAL";
  if (ratio > 1.5) cls = "HIGH"; else if (ratio > 1.2) cls = "ELEVATED"; else if (ratio < 0.8) cls = "LOW";
  return { current: cv, average: av, ratio, classification: cls };
}

function calcHurst(prices, ml = 20) {
  const lags = [], taus = [];
  for (let l = 2; l < Math.min(ml, prices.length); l++) {
    let s = 0, ct = 0;
    for (let i = l; i < prices.length; i++) { s += (prices[i] - prices[i - l]) ** 2; ct++; }
    if (ct > 0) { lags.push(Math.log(l)); taus.push(Math.log(Math.sqrt(s / ct))); }
  }
  if (lags.length < 2) return 0.5;
  const xm = lags.reduce((a, b) => a + b, 0) / lags.length;
  const ym = taus.reduce((a, b) => a + b, 0) / taus.length;
  let n = 0, d = 0;
  for (let i = 0; i < lags.length; i++) { n += (lags[i] - xm) * (taus[i] - ym); d += (lags[i] - xm) ** 2; }
  return d ? n / d : 0.5;
}

function detectRegime(data) {
  const trend = detectTrend(data), vol = classifyVol(data), hurst = calcHurst(data.map(d => d.Close));
  let overall;
  if (trend.strength > 60 && hurst > 0.55) overall = `STRONG_${trend.direction}`;
  else if (trend.strength > 40 && trend.direction !== "SIDEWAYS") overall = `TRENDING_${trend.direction}`;
  else if (hurst < 0.45 && ["LOW", "NORMAL"].includes(vol.classification)) overall = "MEAN_REVERTING";
  else if (vol.classification === "HIGH") overall = "HIGH_VOLATILITY";
  else if (trend.direction === "SIDEWAYS" && ["LOW", "NORMAL"].includes(vol.classification)) overall = "RANGING";
  else overall = "TRANSITIONING";
  return { trend, volatility: vol, hurst, overall };
}

function zscoreSignals(data, w = 20) {
  const c = data.map(d => d.Close), r = c.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (c[c.length - 1] - m) / st : 0;
  let sig = "NEUTRAL", p = 0.5;
  if (z > 2) { sig = "STRONG_SELL"; p = 0.95; } else if (z > 1) { sig = "SELL"; p = 0.68; }
  else if (z < -2) { sig = "STRONG_BUY"; p = 0.95; } else if (z < -1) { sig = "BUY"; p = 0.68; }
  return { signal: sig, zscore: z, probability: p, mean: m, std: st };
}

function momentumSignals(data) {
  const c = data.map(d => d.Close), cur = c[c.length - 1], sc = {};
  [5, 10, 20, 50].forEach(p => { if (c.length > p) sc[`${p}d`] = ((cur / c[c.length - 1 - p]) - 1) * 100; });
  const v = Object.values(sc), avg = v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  const ap = v.every(x => x > 0), an = v.every(x => x < 0);
  let sig = "NEUTRAL";
  if (ap && avg > 5) sig = "STRONG_BUY"; else if (avg > 2) sig = "BUY";
  else if (an && avg < -5) sig = "STRONG_SELL"; else if (avg < -2) sig = "SELL";
  return { signal: sig, avgMomentum: avg, byPeriod: sc, consistency: (ap || an) ? "HIGH" : "LOW" };
}

function volumeSignals(data, w = 20) {
  const vols = data.map(d => d.Volume), r = vols.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (vols[vols.length - 1] - m) / st : 0;
  const lr = data[data.length - 1].Returns || 0;
  let sig = "NEUTRAL";
  if (z > 2 && lr > 0) sig = "STRONG_BUY"; else if (z > 1 && lr > 0) sig = "BUY";
  else if (z > 2 && lr < 0) sig = "STRONG_SELL"; else if (z > 1 && lr < 0) sig = "SELL";
  return { signal: sig, volumeZscore: z, avgVolume: m, currentVolume: vols[vols.length - 1] };
}

function aggregateSignals(signals) {
  const map = { STRONG_BUY: 2, BUY: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2 };
  const wt = { zscore: 0.25, momentum: 0.30, volume: 0.25 };
  let total = 0;
  Object.entries(wt).forEach(([k, w]) => { if (signals[k]) total += (map[signals[k].signal] || 0) * w; });
  let sig = "NEUTRAL", conf = 0.5;
  if (total >= 1.5) { sig = "STRONG_BUY"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total >= 0.5) { sig = "BUY"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -1.5) { sig = "STRONG_SELL"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -0.5) { sig = "SELL"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  return { signal: sig, score: total, confidence: conf };
}

function calcRiskMetrics(data) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < 5) return { volatility: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, var95: 0, cvar95: 0, riskLevel: "LOW" };
  const m = ret.reduce((a, b) => a + b, 0) / ret.length;
  const std = Math.sqrt(ret.reduce((a, v) => a + (v - m) ** 2, 0) / ret.length);
  const vol = std * Math.sqrt(252) * 100, annRet = m * 252;
  const sharpe = std > 0 ? (annRet - 0.02) / (std * Math.sqrt(252)) : 0;
  const ds = ret.filter(r => r < 0);
  const dsStd = ds.length > 0 ? Math.sqrt(ds.reduce((a, v) => a + v ** 2, 0) / ds.length) * Math.sqrt(252) : 0;
  const sortino = dsStd > 0 ? (annRet - 0.02) / dsStd : 0;
  let maxDD = 0, peak = 1, cum = 1;
  ret.forEach(r => { cum *= (1 + r); if (cum > peak) peak = cum; const dd = (cum - peak) / peak; if (dd < maxDD) maxDD = dd; });
  const sorted = [...ret].sort((a, b) => a - b);
  const idx5 = Math.floor(sorted.length * 0.05);
  const var95 = sorted[idx5] * 100;
  const cvSlice = sorted.slice(0, idx5);
  const cvar95 = cvSlice.length > 0 ? (cvSlice.reduce((a, b) => a + b, 0) / cvSlice.length) * 100 : var95;
  let riskLevel = "LOW";
  if (vol > 40 || maxDD < -0.30) riskLevel = "HIGH";
  else if (vol > 25 || maxDD < -0.20) riskLevel = "MEDIUM";
  return { volatility: vol, sharpe, sortino, maxDrawdown: maxDD * 100, var95, cvar95, riskLevel };
}

function generateRecommendation(tech, regime, stat, risk, valuationModels) {
  const sm = { STRONG_BUY: 2, BUY: 1, OVERSOLD: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2, OVERBOUGHT: -1, BULLISH: 1, BEARISH: -1 };
  let ts = 0; Object.values(tech).forEach(s => { ts += sm[s] || 0; });
  const ss = sm[stat.aggregate?.signal] || 0;
  let rs = 0;
  if (regime.overall.includes("UPTREND")) rs = regime.overall.includes("STRONG") ? 1 : 0.5;
  else if (regime.overall.includes("DOWNTREND")) rs = regime.overall.includes("STRONG") ? -1 : -0.5;
  const valuationBias = valuationModels?.signal === "UNDERVALUED" ? 1 : valuationModels?.signal === "OVERVALUED" ? -1 : 0;
  let fs = ts * 0.3 + ss * 0.35 + rs * 0.25 + valuationBias * 0.1;
  if (risk.riskLevel === "HIGH") fs *= 0.7;
  let action = "HOLD", conf = 0.5;
  if (fs >= 1.2) { action = "STRONG BUY"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs >= 0.4) { action = "BUY"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  else if (fs <= -1.2) { action = "STRONG SELL"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs <= -0.4) { action = "SELL"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  return { action, confidence: conf, score: fs, components: { technical: ts, statistical: ss, regime: rs, valuation: valuationBias } };
}

function calcValuation(data) {
  const closes = data.map(d => d.Close), last = closes[closes.length - 1];
  const sma200 = calcSMA(closes, 200), sma50 = calcSMA(closes, 50);
  const sma200Val = sma200[sma200.length - 1], sma50Val = sma50[sma50.length - 1];
  const devSma200 = sma200Val ? ((last - sma200Val) / sma200Val) * 100 : 0;
  const devSma50 = sma50Val ? ((last - sma50Val) / sma50Val) * 100 : 0;
  const bb = calcBB(closes), lastBB = bb[bb.length - 1];
  const pctB = lastBB.upper && lastBB.lower ? (last - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
  const rsi = calcRSI(closes), lastRSI = rsi[rsi.length - 1] || 50;
  const high52 = Math.max(...closes.slice(-252)), low52 = Math.min(...closes.slice(-252));
  const range52Pct = high52 !== low52 ? (last - low52) / (high52 - low52) * 100 : 50;
  let stretch = 0;
  stretch += Math.max(-50, Math.min(50, devSma200)) + 50;
  stretch += Math.max(-50, Math.min(50, devSma50 * 1.5)) + 50;
  stretch += pctB * 100;
  stretch += (lastRSI / 100) * 100;
  stretch += range52Pct;
  stretch = stretch / 5;
  let verdict = "FAIRLY VALUED";
  if (stretch > 80) verdict = "SIGNIFICANTLY OVERVALUED";
  else if (stretch > 65) verdict = "OVERVALUED";
  else if (stretch > 55) verdict = "SLIGHTLY OVERVALUED";
  else if (stretch < 20) verdict = "SIGNIFICANTLY UNDERVALUED";
  else if (stretch < 35) verdict = "UNDERVALUED";
  else if (stretch < 45) verdict = "SLIGHTLY UNDERVALUED";
  const fairValue = sma200Val || sma50Val || last;
  return { stretch, verdict, devSma200, devSma50, pctB, rsi: lastRSI, range52Pct, high52, low52, fairValue, sma200: sma200Val, sma50: sma50Val };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed + salt * 999);
}

function calcFundamentals(ticker, price) {
  const seed = hashCode(ticker || "UNKNOWN");
  const px = price || 100;
  const shares = seededRange(seed, 1, 0.4, 5.0) * 1e9;
  const marketCap = px * shares;
  const ps = seededRange(seed, 2, 1.5, 8);
  const revenue = marketCap / ps;
  const grossMargin = seededRange(seed, 3, 0.3, 0.7);
  const opMargin = clamp(grossMargin * seededRange(seed, 4, 0.35, 0.7), 0.08, grossMargin - 0.05);
  const netMargin = clamp(opMargin * seededRange(seed, 5, 0.6, 0.85), 0.03, opMargin - 0.01);
  const fcfMargin = clamp(opMargin * seededRange(seed, 6, 0.6, 0.95), 0.02, 0.35);
  const revenueGrowth = seededRange(seed, 7, -0.05, 0.18);
  const debtToEquity = seededRange(seed, 8, 0.0, 1.6);
  const equity = marketCap * seededRange(seed, 9, 0.35, 0.8);
  const debt = equity * debtToEquity;
  const cash = revenue * seededRange(seed, 10, 0.04, 0.25);
  const capex = revenue * seededRange(seed, 11, 0.03, 0.08);
  const netIncome = revenue * netMargin;
  const fcf = revenue * fcfMargin;
  const eps = netIncome / shares;
  const fcfPerShare = fcf / shares;
  const dividendYield = seededRange(seed, 12, 0.0, 0.035);
  const dividendPerShare = px * dividendYield;
  const roe = seededRange(seed, 13, 0.08, 0.35);
  const roa = seededRange(seed, 14, 0.03, 0.18);
  const currentRatio = seededRange(seed, 15, 0.9, 2.5);

  const base = {
    revenue, netIncome, fcf, grossMargin, opMargin, netMargin, fcfMargin,
    capex, cash, debt, eps, fcfPerShare, dividendPerShare, roe, roa, currentRatio,
  };

  const periods = ["LTM", "FY2023", "FY2022"].map((label, idx) => {
    const scale = 1 / Math.pow(1 + revenueGrowth, idx);
    const drift = 1 + seededRange(seed, 20 + idx, -0.03, 0.03);
    const rev = revenue * scale * drift;
    const gMargin = clamp(grossMargin * (1 + seededRange(seed, 30 + idx, -0.02, 0.02)), 0.2, 0.8);
    const oMargin = clamp(opMargin * (1 + seededRange(seed, 40 + idx, -0.03, 0.03)), 0.05, gMargin - 0.04);
    const nMargin = clamp(netMargin * (1 + seededRange(seed, 50 + idx, -0.03, 0.03)), 0.02, oMargin - 0.01);
    const fMargin = clamp(fcfMargin * (1 + seededRange(seed, 60 + idx, -0.04, 0.04)), 0.02, 0.35);
    return {
      label,
      revenue: rev,
      netIncome: rev * nMargin,
      fcf: rev * fMargin,
      grossMargin: gMargin,
      opMargin: oMargin,
      netMargin: nMargin,
      fcfMargin: fMargin,
    };
  });

  return {
    source: "Modeled",
    currency: "USD",
    shares,
    marketCap,
    revenueGrowth,
    debtToEquity,
    equity,
    cash,
    debt,
    periods,
    ratios: { grossMargin, opMargin, netMargin, fcfMargin, roe, roa, currentRatio },
    perShare: { eps, fcfPerShare, dividendPerShare },
    base,
  };
}

function buildValuationAssumptions(fundamentals, price, risk) {
  const g = clamp(fundamentals?.revenueGrowth ?? 0.06, -0.02, 0.12);
  const volAdj = risk?.volatility ? Math.min(0.04, risk.volatility / 250) : 0.01;
  const discount = clamp(0.08 + volAdj, 0.07, 0.14);
  const terminalGrowth = clamp(Math.min(0.03, g * 0.5), 0.01, 0.03);
  const targetPE = clamp(12 + g * 100 * 0.8, 10, 28);
  return {
    fcfPerShare: fundamentals?.perShare?.fcfPerShare ?? (price ? price * 0.04 : 3),
    dividendPerShare: fundamentals?.perShare?.dividendPerShare ?? (price ? price * 0.015 : 1),
    eps: fundamentals?.perShare?.eps ?? (price ? price / 20 : 5),
    growthRate: g,
    discountRate: discount,
    terminalGrowth,
    targetPE,
    years: 5,
  };
}

function dcfValue(fcfPerShare, growthRate, discountRate, terminalGrowth, years) {
  if (!fcfPerShare || years <= 0) return null;
  if (discountRate <= terminalGrowth) return null;
  let pv = 0;
  for (let i = 1; i <= years; i++) {
    const cf = fcfPerShare * Math.pow(1 + growthRate, i);
    pv += cf / Math.pow(1 + discountRate, i);
  }
  const terminal = (fcfPerShare * Math.pow(1 + growthRate, years) * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  pv += terminal / Math.pow(1 + discountRate, years);
  return pv;
}

function ddmValue(dividendPerShare, growthRate, discountRate) {
  if (!dividendPerShare) return null;
  if (discountRate <= growthRate) return null;
  return dividendPerShare * (1 + growthRate) / (discountRate - growthRate);
}

function runValuationModels(assumptions, price) {
  if (!assumptions) {
    return { dcf: null, ddm: null, multiples: null, anchor: null, upside: null, signal: "FAIRLY VALUED", issues: [], assumptions: null };
  }
  const a = assumptions;
  const issues = [];
  const dcf = dcfValue(a.fcfPerShare, a.growthRate, a.discountRate, a.terminalGrowth, a.years);
  if (a.discountRate <= a.terminalGrowth) issues.push("Discount rate must exceed terminal growth.");
  const ddmGrowth = Math.min(a.growthRate, 0.06);
  const ddm = a.dividendPerShare > 0 ? ddmValue(a.dividendPerShare, ddmGrowth, a.discountRate) : null;
  if (a.dividendPerShare > 0 && a.discountRate <= ddmGrowth) issues.push("Discount rate must exceed dividend growth.");
  const multiples = a.eps && a.targetPE ? a.eps * a.targetPE : null;
  const vals = [dcf, ddm, multiples].filter(v => Number.isFinite(v) && v > 0);
  const anchor = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const upside = anchor && price ? (anchor / price - 1) : null;
  let signal = "FAIRLY VALUED";
  if (upside != null) {
    if (upside > 0.15) signal = "UNDERVALUED";
    else if (upside < -0.15) signal = "OVERVALUED";
  }
  return { dcf, ddm, multiples, anchor, upside, signal, issues, assumptions: a };
}

function runAnalysis(ticker, rawData) {
  let raw = calcReturns(rawData);
  const closes = raw.map(d => d.Close);
  const rsi = calcRSI(closes), macdD = calcMACD(closes), bb = calcBB(closes);
  const atr = calcATR(raw), stoch = calcStoch(raw), adxD = calcADX(raw);
  const sma20 = calcSMA(closes, 20), sma50 = calcSMA(closes, 50), sma200 = calcSMA(closes, 200);
  const enriched = raw.map((d, i) => ({
    ...d, RSI: rsi[i], MACD: macdD.macd[i], MACD_Signal: macdD.signal[i], MACD_Hist: macdD.histogram[i],
    BB_Upper: bb[i].upper, BB_Middle: bb[i].middle, BB_Lower: bb[i].lower, ATR: atr[i],
    Stoch_K: stoch.k[i], Stoch_D: stoch.d[i], ADX: adxD.adx[i],
    SMA_20: sma20[i], SMA_50: sma50[i], SMA_200: sma200[i],
  }));
  const last = enriched[enriched.length - 1];
  const techSignals = {};
  if (last.RSI != null) techSignals.RSI = last.RSI < 30 ? "OVERSOLD" : last.RSI > 70 ? "OVERBOUGHT" : "NEUTRAL";
  if (last.MACD != null) techSignals.MACD = last.MACD > last.MACD_Signal ? "BULLISH" : "BEARISH";
  if (last.BB_Upper != null) techSignals.Bollinger = last.Close > last.BB_Upper ? "OVERBOUGHT" : last.Close < last.BB_Lower ? "OVERSOLD" : "NEUTRAL";
  if (last.ADX != null) techSignals.ADX = last.ADX > 25 ? "STRONG" : last.ADX > 20 ? "MODERATE" : "WEAK";
  const regime = detectRegime(enriched);
  const zs = zscoreSignals(enriched), mom = momentumSignals(enriched), vol = volumeSignals(enriched);
  const agg = aggregateSignals({ zscore: zs, momentum: mom, volume: vol });
  const statSignals = { zscore: zs, momentum: mom, volume: vol, aggregate: agg };
  const risk = calcRiskMetrics(enriched);
  const cp = last.Close;
  const valuation = calcValuation(enriched);
  const fundamentals = calcFundamentals(ticker, cp);
  const valuationAssumptions = buildValuationAssumptions(fundamentals, cp, risk);
  const valuationModels = runValuationModels(valuationAssumptions, cp);
  const rec = generateRecommendation(techSignals, regime, statSignals, risk, valuationModels);
  const atrVal = last.ATR || cp * 0.02;
  let target = null, stopLoss = null;
  if (rec.action.includes("BUY")) { target = cp + atrVal * (regime.overall.includes("STRONG") ? 3 : 2); stopLoss = cp - atrVal * (regime.overall.includes("STRONG") ? 1.5 : 1); }
  else if (rec.action.includes("SELL")) { target = cp - atrVal * 2; stopLoss = cp + atrVal; }
  return { ticker, data: enriched, currentPrice: cp, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, valuation, fundamentals, valuationModels };
}

const STRATEGIES = {
  STRONG_UPTREND: { strategy: "Trend Following (Long)", tactics: ["Buy breakouts", "Hold positions", "Trail stops"], avoid: ["Counter-trend trades"] },
  STRONG_DOWNTREND: { strategy: "Trend Following (Short)", tactics: ["Short breakdowns", "Tight stops", "Capital preservation"], avoid: ["Catching falling knives"] },
  TRENDING_UPTREND: { strategy: "Trend Following with Caution", tactics: ["Buy dips", "Partial positions", "Take profits"], avoid: ["Overextension"] },
  TRENDING_DOWNTREND: { strategy: "Defensive or Short", tactics: ["Reduce exposure", "Hedge positions"], avoid: ["Aggressive longs"] },
  MEAN_REVERTING: { strategy: "Mean Reversion", tactics: ["Buy oversold", "Sell overbought", "Range trade"], avoid: ["Chasing momentum"] },
  RANGING: { strategy: "Range Trading", tactics: ["Support / resistance", "Oscillator-based"], avoid: ["Trend following"] },
  HIGH_VOLATILITY: { strategy: "Reduced Position Size", tactics: ["Wider stops", "Options strategies"], avoid: ["Full positions"] },
  TRANSITIONING: { strategy: "Wait and Observe", tactics: ["Small positions", "Watch confirmation"], avoid: ["Large commitments"] },
};

const HEATMAP_UNIVERSE = [
  { ticker: "AAPL", name: "Apple", cap: 3800 }, { ticker: "MSFT", name: "Microsoft", cap: 3200 },
  { ticker: "NVDA", name: "NVIDIA", cap: 3100 }, { ticker: "GOOGL", name: "Alphabet", cap: 2300 },
  { ticker: "AMZN", name: "Amazon", cap: 2200 }, { ticker: "META", name: "Meta", cap: 1600 },
  { ticker: "TSLA", name: "Tesla", cap: 1200 }, { ticker: "BRK-B", name: "Berkshire", cap: 1000 },
  { ticker: "LLY", name: "Eli Lilly", cap: 780 }, { ticker: "V", name: "Visa", cap: 600 },
  { ticker: "JPM", name: "JPMorgan", cap: 580 }, { ticker: "WMT", name: "Walmart", cap: 550 },
  { ticker: "UNH", name: "UnitedHealth", cap: 520 }, { ticker: "XOM", name: "ExxonMobil", cap: 480 },
  { ticker: "NFLX", name: "Netflix", cap: 380 }, { ticker: "AMD", name: "AMD", cap: 280 },
  { ticker: "CRM", name: "Salesforce", cap: 260 }, { ticker: "COST", name: "Costco", cap: 380 },
  { ticker: "ADBE", name: "Adobe", cap: 220 }, { ticker: "PEP", name: "PepsiCo", cap: 210 },
];

const SECTOR_COLORS = {
  Technology: "#4A90D9", "Consumer Discretionary": "#E8913A", Healthcare: "#50B87A",
  Financials: "#8B6BB5", Energy: "#D4534E", "Consumer Staples": "#6DBFB8",
  Industrials: "#7A8B99", Communication: "#E06B9F", Materials: "#B8A038",
  "Real Estate": "#5C9EAD", Utilities: "#8FAA6E",
};

const HEATMAP_INDEXES = {
  "S&P 500": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "NVDA", name: "NVIDIA", cap: 3100, sector: "Technology" },
    { ticker: "GOOGL", name: "Alphabet", cap: 2300, sector: "Technology" },
    { ticker: "META", name: "Meta", cap: 1600, sector: "Technology" },
    { ticker: "AMD", name: "AMD", cap: 280, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "ADBE", name: "Adobe", cap: 220, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "TSLA", name: "Tesla", cap: 1200, sector: "Consumer Discretionary" },
    { ticker: "NFLX", name: "Netflix", cap: 380, sector: "Consumer Discretionary" },
    { ticker: "COST", name: "Costco", cap: 380, sector: "Consumer Staples" },
    { ticker: "WMT", name: "Walmart", cap: 550, sector: "Consumer Staples" },
    { ticker: "PEP", name: "PepsiCo", cap: 210, sector: "Consumer Staples" },
    { ticker: "BRK-B", name: "Berkshire", cap: 1000, sector: "Financials" },
    { ticker: "JPM", name: "JPMorgan", cap: 580, sector: "Financials" },
    { ticker: "V", name: "Visa", cap: 600, sector: "Financials" },
    { ticker: "GS", name: "Goldman Sachs", cap: 180, sector: "Financials" },
    { ticker: "LLY", name: "Eli Lilly", cap: 780, sector: "Healthcare" },
    { ticker: "UNH", name: "UnitedHealth", cap: 520, sector: "Healthcare" },
    { ticker: "JNJ", name: "Johnson & Johnson", cap: 380, sector: "Healthcare" },
    { ticker: "XOM", name: "ExxonMobil", cap: 480, sector: "Energy" },
    { ticker: "CVX", name: "Chevron", cap: 280, sector: "Energy" },
    { ticker: "CAT", name: "Caterpillar", cap: 180, sector: "Industrials" },
    { ticker: "UPS", name: "UPS", cap: 110, sector: "Industrials" },
  ],
  "Nasdaq 100": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "NVDA", name: "NVIDIA", cap: 3100, sector: "Technology" },
    { ticker: "GOOGL", name: "Alphabet", cap: 2300, sector: "Technology" },
    { ticker: "META", name: "Meta", cap: 1600, sector: "Technology" },
    { ticker: "AMD", name: "AMD", cap: 280, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "ADBE", name: "Adobe", cap: 220, sector: "Technology" },
    { ticker: "INTC", name: "Intel", cap: 120, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "TSLA", name: "Tesla", cap: 1200, sector: "Consumer Discretionary" },
    { ticker: "NFLX", name: "Netflix", cap: 380, sector: "Consumer Discretionary" },
    { ticker: "COST", name: "Costco", cap: 380, sector: "Consumer Staples" },
    { ticker: "PEP", name: "PepsiCo", cap: 210, sector: "Consumer Staples" },
    { ticker: "LLY", name: "Eli Lilly", cap: 780, sector: "Healthcare" },
    { ticker: "AMGN", name: "Amgen", cap: 150, sector: "Healthcare" },
    { ticker: "GILD", name: "Gilead", cap: 100, sector: "Healthcare" },
  ],
  "Dow 30": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "WMT", name: "Walmart", cap: 550, sector: "Consumer Staples" },
    { ticker: "JPM", name: "JPMorgan", cap: 580, sector: "Financials" },
    { ticker: "V", name: "Visa", cap: 600, sector: "Financials" },
    { ticker: "GS", name: "Goldman Sachs", cap: 180, sector: "Financials" },
    { ticker: "UNH", name: "UnitedHealth", cap: 520, sector: "Healthcare" },
    { ticker: "JNJ", name: "Johnson & Johnson", cap: 380, sector: "Healthcare" },
    { ticker: "XOM", name: "ExxonMobil", cap: 480, sector: "Energy" },
    { ticker: "CVX", name: "Chevron", cap: 280, sector: "Energy" },
    { ticker: "CAT", name: "Caterpillar", cap: 180, sector: "Industrials" },
    { ticker: "BA", name: "Boeing", cap: 130, sector: "Industrials" },
    { ticker: "DIS", name: "Disney", cap: 170, sector: "Communication" },
  ],
};

const TICKER_STRIP_SYMBOLS = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^RUT", label: "Russell 2K" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y Yield" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "CL=F", label: "Crude Oil" },
];

const MARKET_REGIONS = {
  Global: {
    strip: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" }, { symbol: "^RUT", label: "Russell 2K" },
      { symbol: "^VIX", label: "VIX" }, { symbol: "^TNX", label: "10Y Yield" },
      { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" },
      { symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" },
    ],
  },
  US: {
    strip: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" }, { symbol: "^RUT", label: "Russell 2K" },
      { symbol: "^VIX", label: "VIX" }, { symbol: "^TNX", label: "10Y Yield" },
      { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" }],
  },
  Europe: {
    strip: [
      { symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" },
      { symbol: "^FCHI", label: "CAC 40" }, { symbol: "^STOXX50E", label: "Euro Stoxx" },
      { symbol: "EURUSD=X", label: "EUR/USD" }, { symbol: "GBPUSD=X", label: "GBP/USD" },
      { symbol: "^TNX", label: "10Y Yield" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" }],
  },
  Asia: {
    strip: [
      { symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" },
      { symbol: "000001.SS", label: "Shanghai" }, { symbol: "^KS11", label: "KOSPI" },
      { symbol: "^TWII", label: "Taiwan" }, { symbol: "USDJPY=X", label: "USD/JPY" },
      { symbol: "USDCNY=X", label: "USD/CNY" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" }],
  },
};

const REGION_MOVERS = {
  Global: HEATMAP_UNIVERSE,
  US: HEATMAP_UNIVERSE,
  Europe: [
    { ticker: "SHEL", name: "Shell", cap: 200 }, { ticker: "ASML", name: "ASML", cap: 300 },
    { ticker: "SAP", name: "SAP", cap: 250 }, { ticker: "AZN", name: "AstraZeneca", cap: 220 },
    { ticker: "NVS", name: "Novartis", cap: 210 }, { ticker: "TTE", name: "TotalEnergies", cap: 140 },
    { ticker: "SAN", name: "Sanofi", cap: 130 }, { ticker: "DEO", name: "Diageo", cap: 80 },
    { ticker: "UL", name: "Unilever", cap: 120 }, { ticker: "GSK", name: "GSK", cap: 90 },
    { ticker: "RIO", name: "Rio Tinto", cap: 100 }, { ticker: "BTI", name: "BAT", cap: 75 },
  ],
  Asia: [
    { ticker: "TSM", name: "TSMC", cap: 700 }, { ticker: "BABA", name: "Alibaba", cap: 200 },
    { ticker: "TM", name: "Toyota", cap: 250 }, { ticker: "SONY", name: "Sony", cap: 120 },
    { ticker: "HDB", name: "HDFC Bank", cap: 100 }, { ticker: "MUFG", name: "MUFG", cap: 90 },
    { ticker: "PDD", name: "PDD Holdings", cap: 130 }, { ticker: "JD", name: "JD.com", cap: 50 },
    { ticker: "NIO", name: "NIO", cap: 15 }, { ticker: "INFY", name: "Infosys", cap: 70 },
    { ticker: "KB", name: "KB Financial", cap: 25 }, { ticker: "LI", name: "Li Auto", cap: 20 },
  ],
};

const ASSET_SECTIONS = [
  { title: "Cryptocurrencies", symbols: [
    { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "ETH-USD", label: "Ethereum" },
    { symbol: "SOL-USD", label: "Solana" }, { symbol: "XRP-USD", label: "XRP" },
    { symbol: "ADA-USD", label: "Cardano" }, { symbol: "DOGE-USD", label: "Dogecoin" },
  ]},
  { title: "Rates", symbols: [
    { symbol: "^TNX", label: "US 10Y" }, { symbol: "^TYX", label: "US 30Y" },
    { symbol: "^FVX", label: "US 5Y" }, { symbol: "^IRX", label: "US 3M" },
  ]},
  { title: "Commodities", symbols: [
    { symbol: "GC=F", label: "Gold" }, { symbol: "SI=F", label: "Silver" },
    { symbol: "CL=F", label: "Crude Oil" }, { symbol: "NG=F", label: "Nat Gas" },
    { symbol: "HG=F", label: "Copper" }, { symbol: "ZC=F", label: "Corn" },
  ]},
  { title: "Currencies", symbols: [
    { symbol: "EURUSD=X", label: "EUR/USD" }, { symbol: "GBPUSD=X", label: "GBP/USD" },
    { symbol: "USDJPY=X", label: "USD/JPY" }, { symbol: "USDCNY=X", label: "USD/CNY" },
    { symbol: "DX-Y.NYB", label: "DXY" }, { symbol: "AUDUSD=X", label: "AUD/USD" },
  ]},
];

const DEFAULT_TRENDING = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "META", name: "Meta" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "NFLX", name: "Netflix" },
];

const FALLBACK_NEWS = [
  { title: "Mega-cap earnings set the tone for the week ahead", source: "Market Desk", pubDate: "", description: "Major technology companies report quarterly results this week." },
  { title: "Rates pause keeps focus on growth and AI leaders", source: "Global Markets", pubDate: "", description: "Federal Reserve holds rates steady as inflation moderates." },
  { title: "Energy rebounds while defensives stay bid", source: "Daily Brief", pubDate: "", description: "Oil prices recover on supply concerns and geopolitical tensions." },
  { title: "Retail sales preview: expectations and risks", source: "Macro Wire", pubDate: "", description: "Consumer spending data expected to show continued resilience." },
];

const NEWS_PLACEHOLDER_IMAGE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%25' stop-color='%23EFE7DC'/><stop offset='100%25' stop-color='%23D7C8B4'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Verdana' font-size='36' fill='%236B5E52'>Market%20News</text></svg>";


const SCORECARD_INDICATORS = [
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y Yield" },
  { symbol: "DX-Y.NYB", label: "Dollar (DXY)" },
  { symbol: "GC=F", label: "Gold" },
];

const CROSS_ASSET_SYMBOLS = [
  { symbol: "SPY", label: "Stocks" },
  { symbol: "TLT", label: "Bonds" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "BTC-USD", label: "Crypto" },
  { symbol: "UUP", label: "Dollar" },
];

const SECTOR_ETFS = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLV", label: "Healthcare" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLC", label: "Comm. Services" },
  { symbol: "XLY", label: "Consumer Disc." },
  { symbol: "XLP", label: "Consumer Staples" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLB", label: "Materials" },
];

const YIELD_CURVE_TENORS = [
  { symbol: "^IRX", label: "3M", maturity: 0.25 },
  { symbol: "^FVX", label: "5Y", maturity: 5 },
  { symbol: "^TNX", label: "10Y", maturity: 10 },
  { symbol: "^TYX", label: "30Y", maturity: 30 },
];

const PORTFOLIO_TILE = {
  value: 248300,
  dayChangePct: 1.12,
  ytdPct: 8.6,
  cash: 12400,
  risk: "Moderate",
  top: ["AAPL", "NVDA", "MSFT", "AMZN", "META"],
};

const CHANGELOG = [
  {
    version: "0.3.12",
    date: "Feb 8, 2026",
    items: [
      "GitHub Pages deployment support with gh-pages and homepage config",
      "Global markets grid with region movers and show-more popups",
      "Search bar with Yahoo Finance autocomplete and /api/search support",
      "Asset class sections (crypto, rates, commodities, FX) with live prices",
      "News cards now include images and expanded to 20 items",
      "Live ticker refresh runs immediately and avoids UI skeleton flashes",
    ],
  },
  {
    version: "0.3.11",
    date: "Feb 8, 2026",
    items: [
      "Brand refresh: logo icon, refined typography, ambient glow",
      "Home page hero section with live market status",
      "Auto-scrolling marquee ticker strip with LIVE pulse badge",
      "Market region cycling with split red/green intraday charts",
      "DEV toggles for live tickers and performance monitor",
      "Longer sparklines and clearer mover/trending layouts",
    ],
  },
  {
    version: "0.3.10",
    date: "Feb 8, 2026",
    items: [
      "Home dashboard with news, market snapshot, and popular tickers",
      "Financials visuals refresh with radar + cash/debt views",
      "Homepage overhaul into a live market dashboard",
      "Real-time ticker strip, intraday charts, movers, and trending sparklines",
      "RSS news feed, skeleton loading states, and collapsible changelog banner",
    ],
  },
  {
    version: "0.3.9",
    date: "Feb 2026",
    items: [
      "Stock vs Financials analysis split",
      "Valuation toolkit and fundamentals aggregator",
    ],
  },
];


// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM + UI COMPONENTS
// ═══════════════════════════════════════════════════════════
const C = {
  cream: "#FAF7F2", warmWhite: "#F5F1EA", paper: "#EDE8DF",
  rule: "#D4CBBB", ruleFaint: "#E8E1D6",
  ink: "#1A1612", inkSoft: "#3D362E", inkMuted: "#7A7067", inkFaint: "#A69E94",
  up: "#1B6B3A", upBg: "#E8F5ED", down: "#9B1B1B", downBg: "#FBE8E8",
  hold: "#8B6914", holdBg: "#FDF6E3", accent: "#8B2500", chart4: "#5B4A8A",
};

const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const fmtPct = (n, d = 1) => n != null ? `${Number(n).toFixed(d)}%` : "—";
const fmtMoney = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${Number(n).toFixed(2)}`;
};
const recColor = (a) => a?.includes("BUY") ? C.up : a?.includes("SELL") ? C.down : C.hold;
const valColor = (v) => v?.includes("OVER") ? C.down : v?.includes("UNDER") ? C.up : C.hold;
const latColor = (ms) => ms < 200 ? C.up : ms < 800 ? C.hold : C.down;

function LogoIcon({ size = 20, color }) {
  const c = color || C.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="26" cy="4" r="2" fill={c} opacity="0.9" />
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.15" style={{ filter: "blur(3px)" }} />
    </svg>
  );
}

function IconGear({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke={color} strokeWidth="1.6" />
      <path d="M19.4 12a7.4 7.4 0 0 0-.08-1l2.02-1.56-1.6-2.77-2.44 1a7.6 7.6 0 0 0-1.74-1L15.3 3h-3.2l-.26 2.67a7.6 7.6 0 0 0-1.74 1l-2.44-1-1.6 2.77L8.08 11a7.4 7.4 0 0 0 0 2l-2.02 1.56 1.6 2.77 2.44-1c.53.4 1.11.73 1.74 1L12.1 21h3.2l.26-2.67c.63-.27 1.21-.6 1.74-1l2.44 1 1.6-2.77L19.32 13c.05-.33.08-.66.08-1Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconGlobe({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 12h17" stroke={color} strokeWidth="1.2" />
      <path d="M12 3c3 3.2 3 14.8 0 18" stroke={color} strokeWidth="1.2" />
      <path d="M12 3c-3 3.2-3 14.8 0 18" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function IconCrown({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 8 8.5 12 12 6l3.5 6L20 8l-2 9H6L4 8Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 19h11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconGift({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 11h16v9H4z" stroke={color} strokeWidth="1.4" />
      <path d="M12 11v9" stroke={color} strokeWidth="1.4" />
      <path d="M3 7h18v4H3z" stroke={color} strokeWidth="1.4" />
      <path d="M12 7c-1.6 0-3-1.1-3-2.5S10.2 2 12 4c1.8-2 3-1.1 3 0.5S13.6 7 12 7Z" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function IconLogout({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 4h9v4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 20h9v-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 12h10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 8l4 4-4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ size = 14, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M9 6l6 6-6 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck({ size = 14, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M5 12l4 4L19 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark({ size = 26, pro = false, muted = false, weight = 300, iconOnly = false }) {
  const iconSize = Math.round(size * 0.78);
  const content = (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: Math.round(size * 0.28),
      lineHeight: 1,
      position: "relative",
    }}>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
        <LogoIcon size={iconSize} color={muted ? C.inkMuted : C.ink} />
      </div>
      {!iconOnly && (
        <div style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontSize: size,
            fontWeight: weight,
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Analyze</span>
          <span style={{
            fontSize: size,
            fontWeight: Math.min(weight + 200, 700),
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Alpha</span>
          {pro && (
            <span style={{
              fontSize: Math.round(size * 0.42),
              fontWeight: 700,
              fontFamily: "var(--body)",
              letterSpacing: "0.06em",
              color: muted ? C.inkFaint : C.inkSoft,
              textTransform: "uppercase",
              marginLeft: 2,
              alignSelf: "flex-start",
              marginTop: Math.round(size * 0.08),
            }}>Pro</span>
          )}
        </div>
      )}
    </div>
  );
  return content;
}

function ProTag({ small = false }) {
  return (
    <span style={{
      fontWeight: 700,
      fontSize: small ? 9 : 10,
      color: C.ink,
      fontFamily: "var(--body)",
      letterSpacing: "0.04em",
    }}>
      Pro
    </span>
  );
}

function ProGate({ title = "Pro Required", description, features }) {
  return (
    <div style={{ border: `1px dashed ${C.rule}`, background: C.warmWhite, padding: 28, textAlign: "center", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}><ProTag /></div>
      <div style={{ fontFamily: "var(--display)", fontSize: 22, color: C.ink }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.6 }}>{description}</div>}
      {features && (
        <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
          {features.map((f) => (
            <div key={f} style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--mono)" }}>{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Signal({ value }) {
  const col = {
    STRONG_BUY: C.up, BUY: C.up, OVERSOLD: C.up, BULLISH: C.up,
    NEUTRAL: C.hold, SELL: C.down, STRONG_SELL: C.down, OVERBOUGHT: C.down, BEARISH: C.down,
    STRONG: C.up, MODERATE: C.hold, WEAK: C.inkMuted,
    HIGH: C.down, LOW: C.up, NORMAL: C.hold, ELEVATED: C.accent,
  }[value] || C.inkMuted;
  return <span style={{ color: col, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{value}</span>;
}

function Row({ label, value, color, border = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: border ? `1px solid ${C.ruleFaint}` : "none" }}>
      <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{label}</span>
      <span style={{ color: color || C.ink, fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function HelpWrap({ help, enabled, onShow, onHide, block = false, children }) {
  if (!help || !enabled) return children;
  return (
    <div
      onMouseEnter={e => onShow?.(e, help)}
      onMouseLeave={onHide}
      style={{
        display: block ? "block" : "inline-flex",
        outline: `1px dashed ${C.rule}`,
        outlineOffset: 4,
        borderRadius: 6,
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, children, style, actions }) {
  const baseStyle = { minWidth: 0, ...style };
  return (
    <div style={baseStyle}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", paddingBottom: 8, borderBottom: `2px solid ${C.ink}`, marginBottom: 10 }}>
          <span>{title}</span>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Sparkline({ data, color = C.ink, prevClose, width = 120, height = 36 }) {
  if (!data || data.length < 2) return null;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  let refY = null;
  if (prevClose != null && prevClose >= min && prevClose <= max) {
    refY = height - pad - ((prevClose - min) / span) * (height - pad * 2);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {refY != null && (
        <line x1={pad} y1={refY} x2={width - pad} y2={refY} stroke={C.inkFaint} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
      )}
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LiveBadge({ latency, source }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.up, display: "inline-block", animation: "livePulse 2s ease infinite", boxShadow: `0 0 6px ${C.up}55` }} />
      <span style={{ color: C.up }}>LIVE</span>
      <span style={{ color: C.inkFaint }}>·</span>
      <span style={{ color: C.inkMuted, fontSize: 9 }}>{source}</span>
      <span style={{ color: latColor(latency), fontSize: 9 }}>{latency}ms</span>
    </span>
  );
}

function usePrevious(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

function useInView(rootMargin = "200px 0px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

function LazySection({ children, minHeight = 140, rootMargin = "200px 0px" }) {
  const [ref, inView] = useInView(rootMargin);
  return (
    <div ref={ref} style={{ minHeight }}>
      {inView ? children : null}
    </div>
  );
}

function AnimatedPrice({ price, prevPrice, large = false }) {
  const safePrev = prevPrice ?? price;
  const dir = price > safePrev ? "up" : price < safePrev ? "down" : "same";
  const col = dir === "up" ? C.up : dir === "down" ? C.down : C.ink;
  const sz = large ? 42 : 16;
  const next = `$${fmt(price)}`;
  const prev = `$${fmt(safePrev)}`;
  const len = Math.max(next.length, prev.length);
  const nextPad = next.padStart(len, " ");
  const prevPad = prev.padStart(len, " ");
  const digitCount = nextPad.split("").filter(ch => ch >= "0" && ch <= "9").length;
  let digitIndex = 0;

  return (
    <div style={{ overflow: "hidden", position: "relative", height: large ? 52 : 22, color: col, whiteSpace: "pre" }}>
      <div style={{
        fontSize: sz, fontWeight: large ? 300 : 600,
        fontFamily: large ? "var(--display)" : "var(--mono)",
        lineHeight: large ? "52px" : "22px",
        fontVariantNumeric: "tabular-nums",
        transition: "color 0.6s ease",
      }}>
        {nextPad.split("").map((ch, i) => {
          const prevCh = prevPad[i];
          const isDigit = ch >= "0" && ch <= "9";
          const changed = isDigit && ch !== prevCh;
          const anim = changed && dir !== "same" ? `slide${dir === "up" ? "Up" : "Down"} 0.35s cubic-bezier(0.16,1,0.3,1)` : "none";
          const order = isDigit ? (digitCount - 1 - digitIndex) : 0;
          if (isDigit) digitIndex += 1;
          const delay = changed ? `${Math.max(0, order) * 0.02}s` : "0s";
          return (
            <span key={`${i}-${ch}`} style={{ display: "inline-block", animation: anim, animationDelay: delay, animationFillMode: "both" }}>
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CandlestickSeries({ data, xAxisMap, yAxisMap }) {
  const xAxis = Object.values(xAxisMap || {})[0];
  const yAxis = Object.values(yAxisMap || {})[0];
  if (!xAxis || !yAxis) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  const band = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 10;
  const bodyWidth = Math.max(4, band * 0.85);

  return (
    <g>
      {(data || []).map((d, i) => {
        if (d == null || d.o == null || d.h == null || d.l == null || d.c == null) return null;
        const x = xScale(d.n) + band / 2;
        const open = d.o, close = d.c, high = d.h, low = d.l;
        const color = close >= open ? C.up : C.down;
        const bodyTop = yScale(Math.max(open, close));
        const bodyBottom = yScale(Math.min(open, close));
        const wickTop = yScale(high);
        const wickBottom = yScale(low);
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1.2} />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function ExpandedChartModal({ title, mode, data, onClose, dataKey, period, interval, onReanalyze, ticker }) {
  const [window, setWindow] = useState({ start: 0, end: Math.max(0, (data?.length || 1) - 1) });
  const [chartType, setChartType] = useState(mode === "price" ? "candles" : "line");
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const initRef = useRef({ key: null, mode: null });
  const windowRef = useRef(window);
  const rafRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    windowRef.current = window;
  }, [window]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const len = data?.length || 0;
    if (!len) return;
    const key = dataKey || title || "chart";
    if (initRef.current.key === key && initRef.current.mode === mode) return;
    initRef.current = { key, mode };
    const end = len - 1;
    const size = Math.min(200, len);
    const start = Math.max(0, end - size + 1);
    const next = { start, end };
    windowRef.current = next;
    pendingRef.current = null;
    setWindow(next);
    setChartType(mode === "price" ? "candles" : "line");
  }, [data?.length, mode, dataKey, title]);

  const clampWindow = (start, end) => {
    if (!data || data.length === 0) return { start: 0, end: 0 };
    const max = data.length - 1;
    let s = Math.max(0, start);
    let e = Math.min(max, end);
    const minSize = Math.min(30, max + 1);
    if (e - s + 1 < minSize) {
      e = Math.min(max, s + minSize - 1);
      s = Math.max(0, e - minSize + 1);
    }
    return { start: s, end: e };
  };

  const commitWindow = (next) => {
    pendingRef.current = next;
    windowRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        setWindow(pendingRef.current);
        pendingRef.current = null;
      }
    });
  };

  const shiftWindow = (delta) => {
    const base = pendingRef.current || windowRef.current;
    const size = base.end - base.start + 1;
    const next = clampWindow(base.start + delta, base.start + delta + size - 1);
    commitWindow(next);
  };

  const zoomWindow = (factor) => {
    const base = pendingRef.current || windowRef.current;
    if (!data || data.length === 0) return;
    const size = base.end - base.start + 1;
    const target = Math.max(30, Math.min(data.length, Math.round(size * factor)));
    const center = (base.start + base.end) / 2;
    const start = Math.round(center - target / 2);
    const end = start + target - 1;
    commitWindow(clampWindow(start, end));
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (!data || data.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const size = windowRef.current.end - windowRef.current.start + 1;
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (absX > 0.5) {
      const width = rect?.width || 1;
      const shift = Math.round((e.deltaX / width) * size);
      if (shift !== 0) shiftWindow(shift);
      return;
    }
    if (absY > 0.5) {
      zoomWindow(e.deltaY > 0 ? 1.1 : 0.9);
    }
  };

  const onMouseDown = (e) => {
    dragRef.current = { x: e.clientX, start: windowRef.current.start, end: windowRef.current.end };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.x;
    const size = dragRef.current.end - dragRef.current.start + 1;
    const shift = Math.round(-dx / rect.width * size);
    const next = clampWindow(dragRef.current.start + shift, dragRef.current.end + shift);
    commitWindow(next);
  };
  const onMouseUp = () => { dragRef.current = null; };

  const windowData = useMemo(() => data?.slice(window.start, window.end + 1) || [], [data, window.start, window.end]);
  const controlBtn = (on) => ({
    padding: "6px 10px",
    border: `1px solid ${on ? C.ink : C.rule}`,
    background: on ? C.ink : "transparent",
    color: on ? C.cream : C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.cream, border: `1px solid ${C.rule}`, width: "96%", height: "92%", maxWidth: 1400, boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "price" && (
              <>
                <button onClick={() => setChartType("line")} style={controlBtn(chartType === "line")}>Line</button>
                <button onClick={() => setChartType("candles")} style={controlBtn(chartType === "candles")}>Candles</button>
              </>
            )}
            {onReanalyze && ticker && (
              <>
                <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "5px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "5px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </>
            )}
            <button onClick={() => zoomWindow(0.85)} style={controlBtn(false)}>Zoom In</button>
            <button onClick={() => zoomWindow(1.15)} style={controlBtn(false)}>Zoom Out</button>
            <button onClick={() => commitWindow(clampWindow(0, (data?.length || 1) - 1))} style={controlBtn(false)}>Reset</button>
            <button onClick={onClose} style={controlBtn(false)}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div ref={containerRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{ flex: 1, background: C.warmWhite, border: `1px solid ${C.rule}`, position: "relative", cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none" }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === "volume" ? (
                <BarChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                </BarChart>
              ) : mode === "rsi" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
                </LineChart>
              ) : mode === "macd" ? (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
                </ComposedChart>
              ) : mode === "stoch" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
                </LineChart>
              ) : (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} />
                  <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} />
                  <Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} />
                  {chartType === "candles" ? (
                    <Customized component={CandlestickSeries} />
                  ) : (
                    <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>
            Horizontal scroll pans. Vertical scroll adjusts the selection window. Drag to move. Window: {window.end - window.start + 1} / {data?.length || 0}
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data || []}>
                <XAxis dataKey="n" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Line dataKey="c" stroke={C.inkSoft} dot={false} strokeWidth={1} />
                <Brush dataKey="n" height={22} stroke={C.rule} fill={C.warmWhite} travellerWidth={8}
                  startIndex={window.start} endIndex={window.end}
                  onChange={(r) => {
                    if (!r || r.startIndex == null || r.endIndex == null) return;
                    commitWindow(clampWindow(r.startIndex, r.endIndex));
                  }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ ticker, isPro }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 20, position: "relative" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 1 }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative", zIndex: 1, animation: "alphaFloat 3s ease-in-out infinite" }}>
            <LogoIcon size={40} />
          </div>
        </div>
        <BrandMark size={28} pro={isPro} weight={300} />
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, zIndex: 1 }}>
        Analyzing <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)" }}>{ticker}</span>
      </div>
      <div style={{ width: 200, height: 2, background: C.ruleFaint, borderRadius: 2, overflow: "hidden", zIndex: 1 }}>
        <div style={{ width: "55%", height: "100%", background: "linear-gradient(90deg, rgba(26,22,18,0), rgba(26,22,18,0.7), rgba(26,22,18,0))", animation: "proSweep 1.6s ease infinite" }} />
      </div>
      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)", zIndex: 1, letterSpacing: "0.04em" }}>Live data via Yahoo Finance</div>
    </div>
  );
}

function ErrorScreen({ error, debugInfo, onRetry }) {
  const [showDebug, setShowDebug] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 16 }}>
      <BrandMark size={24} muted />
      <div style={{ fontSize: 24, fontFamily: "var(--display)", color: C.ink, fontWeight: 600 }}>Connection Failed</div>
      <div style={{ fontSize: 14, color: C.inkMuted, fontFamily: "var(--body)", textAlign: "center", maxWidth: 440, lineHeight: 1.6 }}>
        Unable to retrieve market data. If running locally, make sure the proxy server is running with <code style={{ background: C.paper, padding: "2px 6px", fontFamily: "var(--mono)", fontSize: 12 }}>npm start</code>.
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button onClick={onRetry} style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Retry</button>
        <button onClick={() => setShowDebug(!showDebug)} style={{ padding: "10px 20px", background: "transparent", color: C.inkMuted, border: `1px solid ${C.rule}`, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>{showDebug ? "Hide" : "Debug"} Info</button>
      </div>
      {showDebug && debugInfo && (
        <div style={{ marginTop: 12, padding: 16, background: C.warmWhite, border: `1px solid ${C.rule}`, maxWidth: 600, width: "100%", fontSize: 11, fontFamily: "var(--mono)", color: C.inkSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
          {JSON.stringify(debugInfo, null, 2)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME TAB — SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function SkeletonBlock({ width = "100%", height = 16, style }) {
  return (
    <div style={{ width, height, background: `linear-gradient(90deg, ${C.paper} 25%, ${C.warmWhite} 50%, ${C.paper} 75%)`, backgroundSize: "200% 100%", animation: "loadSlide 1.5s ease-in-out infinite", borderRadius: 2, ...style }} />
  );
}

function TickerStrip({ data, loading, onAnalyze }) {
  const renderItem = (item, idx) => (
    <button
      key={item.symbol + "-" + idx}
      type="button"
      onClick={() => onAnalyze?.(item.symbol)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        minWidth: 140,
        borderRight: `1px solid rgba(255,255,255,0.08)`,
        whiteSpace: "nowrap",
        background: "transparent",
        border: "none",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.2s ease, background 0.2s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", fontWeight: 600 }}>{item.label}</span>
      <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#fff", fontWeight: 600 }}>
        {item.loaded ? (item.price >= 1000 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : item.price.toFixed(2)) : "—"}
      </span>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: item.changePct > 0 ? "#4ADE80" : item.changePct < 0 ? "#F87171" : "rgba(255,255,255,0.5)" }}>
        {item.loaded ? `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%` : ""}
      </span>
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", background: C.ink, overflow: "hidden", minWidth: 0 }}>
      {/* LIVE badge — fixed, does not scroll */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRight: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "livePulse 2s ease-in-out infinite", boxShadow: "0 0 6px rgba(74,222,128,0.4)" }} />
        <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#4ADE80", fontWeight: 700, letterSpacing: "0.08em" }}>LIVE</span>
      </div>
      {/* Scrolling content */}
      <div className="ticker-strip-scroll" style={{ flex: 1, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex" }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", minWidth: 140, borderRight: `1px solid rgba(255,255,255,0.08)` }}>
                <SkeletonBlock width={60} height={10} style={{ opacity: 0.2 }} />
                <SkeletonBlock width={50} height={12} style={{ opacity: 0.15 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="ticker-strip-inner" style={{ display: "flex", width: "max-content" }}>
            {data.map((item, i) => renderItem(item, i))}
            {data.map((item, i) => renderItem(item, i + data.length))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniIntradayChart({ data, label, loading, onAnalyze, ticker, compact = false }) {
  if (loading || !data) {
    return (
      <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minHeight: 180 }}>
        <SkeletonBlock width={100} height={10} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="100%" height={120} />
      </div>
    );
  }
  const { points, prevClose } = data;
  const chartData = points.map(p => ({
    time: p.time,
    price: p.price,
    aboveOpen: Math.max(p.price, prevClose),
    belowOpen: Math.min(p.price, prevClose),
  }));

  const lastPrice = points.length ? points[points.length - 1].price : prevClose;
  const change = lastPrice - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const color = lastPrice >= prevClose ? C.up : C.down;
  const changeBg = lastPrice >= prevClose ? C.upBg : C.downBg;
  const safeLabel = label.replace(/[^a-zA-Z0-9]/g, "");
  const clickable = !!onAnalyze && !!ticker;
  return (
    <button
      type="button"
      onClick={() => clickable && onAnalyze?.(ticker)}
      style={{
        padding: compact ? "12px 14px" : "16px 20px",
        background: C.warmWhite,
        border: `1px solid ${C.rule}`,
        cursor: clickable ? "pointer" : "default",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: compact ? 9 : 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: compact ? 22 : 30, fontFamily: "var(--display)", color: C.inkSoft, fontWeight: 600, marginLeft: 12 }}>{fmt(lastPrice)}</span>
        </div>
        <span style={{ fontSize: compact ? 12 : 14, fontFamily: "var(--mono)", fontWeight: 800, color, background: changeBg, padding: compact ? "3px 6px" : "4px 8px", borderRadius: 10 }}>
          {change >= 0 ? "+" : ""}{fmt(change)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={compact ? 90 : 120}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={`gradUp-${safeLabel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.up} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.up} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`gradDn-${safeLabel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.down} stopOpacity={0.02} />
              <stop offset="100%" stopColor={C.down} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <ReferenceLine y={prevClose} stroke={C.rule} strokeDasharray="3 3" />
          <Area type="monotone" dataKey="aboveOpen" stroke="none" fill={`url(#gradUp-${safeLabel})`} baseValue={prevClose} dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="belowOpen" stroke="none" fill={`url(#gradDn-${safeLabel})`} baseValue={prevClose} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <XAxis dataKey="time" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, fontSize: 11, fontFamily: "var(--mono)" }}
            formatter={(v, name) => name === "price" ? [`$${Number(v).toFixed(2)}`, "Price"] : [null, null]}
            labelFormatter={(l) => l}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </button>
  );
}

function MoverPopup({ title, stocks, onAnalyze, onClose }) {
  return (
    <div className="popup-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="popup-card" onClick={e => e.stopPropagation()} style={{ background: C.cream, border: `1px solid ${C.rule}`, width: 480, maxHeight: "80vh", boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.inkMuted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 20px 20px" }}>
          {stocks.map((s) => (
            <button key={s.ticker} onClick={() => { onAnalyze?.(s.ticker); onClose(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 4px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.paper}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "grid", gap: 2, minWidth: 80 }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: C.ink }}>{s.ticker}</span>
                <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>{s.name}</span>
              </div>
              {s.spark && s.spark.length > 1 && <Sparkline data={s.spark} color={s.changePct >= 0 ? C.up : C.down} prevClose={s.prevClose} />}
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: C.ink }}>${fmt(s.price)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.changePct >= 0 ? C.up : C.down, marginLeft: 8 }}>
                  {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoverColumn({ title, stocks, allStocks, loading, onAnalyze }) {
  const [showPopup, setShowPopup] = useState(false);
  const display = stocks ? stocks.slice(0, 5) : [];

  if (loading) {
    return (
      <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minWidth: 0, width: "100%" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12 }}>{title}</div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
            <SkeletonBlock width={50} height={12} />
            <SkeletonBlock width={60} height={12} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minWidth: 0, width: "100%" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {(!display || display.length === 0) ? (
        <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", padding: "12px 0" }}>No data available</div>
      ) : (
        <>
          {display.map((s) => (
            <button key={s.ticker} onClick={() => onAnalyze?.(s.ticker)}
              style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", width: "100%", padding: "8px 4px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.paper}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "grid", gap: 2, minWidth: 0, overflow: "hidden" }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: C.ink }}>{s.ticker}</span>
                <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              </div>
              <div style={{ padding: "0 8px" }}>
                {s.spark && s.spark.length > 1 && <Sparkline data={s.spark} color={s.changePct >= 0 ? C.up : C.down} prevClose={s.prevClose} />}
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: C.ink }}>${fmt(s.price)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.changePct >= 0 ? C.up : C.down, marginLeft: 8 }}>
                  {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
          {allStocks && allStocks.length > 5 && (
            <button onClick={() => setShowPopup(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "8px 4px", background: "transparent", border: "none", cursor: "pointer", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", fontWeight: 600, gap: 4, marginTop: 4, transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = C.ink}
              onMouseLeave={e => e.currentTarget.style.color = C.inkMuted}>
              Show all {allStocks.length} →
            </button>
          )}
        </>
      )}
      {showPopup && allStocks && (
        <MoverPopup title={title} stocks={allStocks} onAnalyze={onAnalyze} onClose={() => setShowPopup(false)} />
      )}
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

function NewsSection({ news, loading }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gap: 1 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: "14px 16px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
            <SkeletonBlock width="80%" height={14} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="60%" height={10} />
          </div>
        ))}
      </div>
    );
  }
  if (!news || news.length === 0) {
    return (
      <div style={{ padding: "16px", background: C.warmWhite, border: `1px solid ${C.rule}`, fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)" }}>
        No headlines available right now.
      </div>
    );
  }
  const hero = news[0];
  const heroImage = hero.image || NEWS_PLACEHOLDER_IMAGE;
  const rest = news.slice(1);
  const cards = rest.slice(0, 6);
  const publishedText = hero.pubDate ? `Published ${timeAgo(hero.pubDate)}` : "Published recently";
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <a href={hero.link || "#"} target="_blank" rel="noopener noreferrer"
        style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", minHeight: 260, background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 16, textDecoration: "none", color: C.ink, overflow: "hidden" }}>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.24em", textTransform: "uppercase", color: C.inkFaint }}>Top Story</div>
          <div>
            <div style={{ fontSize: 28, fontFamily: "var(--display)", lineHeight: 1.2, color: C.inkSoft }}>{hero.title}</div>
            {hero.description && (
              <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.6, marginTop: 10 }}>{hero.description}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
            <span>{publishedText}</span>
            <span style={{ color: C.ruleFaint }}>·</span>
            <span style={{ fontWeight: 600 }}>{hero.source || "Yahoo Finance"}</span>
          </div>
        </div>
        <div style={{ position: "relative", background: C.paper }}>
          <img src={heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.src = NEWS_PLACEHOLDER_IMAGE; }} />
        </div>
      </a>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {cards.map((n, i) => {
          const cardImage = n.image || NEWS_PLACEHOLDER_IMAGE;
          return (
            <a key={i} href={n.link || "#"} target="_blank" rel="noopener noreferrer"
              style={{ display: "grid", gridTemplateRows: "120px auto", background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 14, textDecoration: "none", color: C.ink, overflow: "hidden", transition: "transform 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ position: "relative", background: C.paper }}>
                <img src={cardImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.src = NEWS_PLACEHOLDER_IMAGE; }} />
              </div>
              <div style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.ink, fontWeight: 500, lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
                  <span style={{ fontWeight: 600 }}>{n.source || "Yahoo Finance"}</span>
                  {n.pubDate && <>
                    <span style={{ color: C.ruleFaint }}>|</span>
                    <span>{timeAgo(n.pubDate)}</span>
                  </>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function MiniCard({ title, children, style }) {
  return (
    <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: "14px 16px", display: "grid", gap: 10, ...style }}>
      {title && (
        <div style={{ fontSize: 10, fontFamily: "var(--body)", letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function MarketScorecardCard() {
  const [spData, setSpData] = useState(null);
  const [indicators, setIndicators] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchStockData("^GSPC", "1y", "1d"),
      Promise.allSettled(SCORECARD_INDICATORS.map(ind => fetchQuickQuote(ind.symbol))),
    ]).then(([stockResult, indResults]) => {
      if (cancelled) return;
      const hist = stockResult.data;
      const latest = hist[hist.length - 1]?.Close || 0;
      const prev1d = hist.length > 1 ? hist[hist.length - 2]?.Close : latest;
      const prev1w = hist.length > 5 ? hist[hist.length - 6]?.Close : hist[0]?.Close;
      const prev1m = hist.length > 22 ? hist[hist.length - 23]?.Close : hist[0]?.Close;
      const firstOfYear = hist[0]?.Close || latest;
      const calcRet = (from) => from ? ((latest - from) / from) * 100 : 0;
      setSpData({
        price: latest,
        ret1d: calcRet(prev1d),
        ret1w: calcRet(prev1w),
        ret1m: calcRet(prev1m),
        retYtd: calcRet(firstOfYear),
      });
      setIndicators(SCORECARD_INDICATORS.map((ind, i) => {
        const r = indResults[i];
        if (r.status === "fulfilled") return { ...ind, price: r.value.price, changePct: r.value.changePct, ok: true };
        return { ...ind, price: 0, changePct: 0, ok: false };
      }));
      setLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const vixColor = (v) => {
    if (v < 15) return C.up;
    if (v < 20) return C.hold;
    if (v < 30) return "#D97706";
    return C.down;
  };
  const vixWidth = (v) => Math.min(100, (v / 40) * 100);

  const ReturnPill = ({ label, value }) => (
    <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: value >= 0 ? C.upBg : C.downBg, color: value >= 0 ? C.up : C.down }}>
      {label} {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );

  return (
    <MiniCard title="Market Scorecard">
      {!loaded ? (
        <div style={{ display: "grid", gap: 8 }}>
          <SkeletonBlock height={24} />
          <SkeletonBlock height={16} />
          <SkeletonBlock height={16} />
          <SkeletonBlock height={16} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>S&P 500</span>
              <span style={{ fontSize: 16, fontFamily: "var(--mono)", fontWeight: 700, color: C.ink }}>
                {spData.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ReturnPill label="1D" value={spData.ret1d} />
              <ReturnPill label="1W" value={spData.ret1w} />
              <ReturnPill label="1M" value={spData.ret1m} />
              <ReturnPill label="YTD" value={spData.retYtd} />
            </div>
          </div>
          {indicators.find(d => d.label === "VIX" && d.ok) && (() => {
            const vix = indicators.find(d => d.label === "VIX");
            return (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>VIX</span>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: vixColor(vix.price) }}>{vix.price.toFixed(1)}</span>
                </div>
                <div style={{ height: 6, background: C.paper, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${vixWidth(vix.price)}%`, background: vixColor(vix.price), borderRadius: 3, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })()}
          <div style={{ display: "grid", gap: 0 }}>
            {indicators.filter(d => d.label !== "VIX" && d.ok).map(d => (
              <div key={d.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted }}>{d.label}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>
                    {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                    {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MiniCard>
  );
}

function CrossAssetCard() {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(CROSS_ASSET_SYMBOLS.map(a => fetchQuickQuote(a.symbol))).then(results => {
      if (cancelled) return;
      setData(CROSS_ASSET_SYMBOLS.map((a, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...a, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, prevClose: r.value.prevClose, ok: true };
        return { ...a, price: 0, changePct: 0, spark: [], prevClose: 0, ok: false };
      }));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <MiniCard title="Cross-Asset Pulse">
      <div style={{ display: "grid", gap: 0 }}>
        {!loaded ? (
          CROSS_ASSET_SYMBOLS.map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <SkeletonBlock width={60} height={12} />
              <SkeletonBlock width={120} height={24} />
              <SkeletonBlock width={60} height={12} />
            </div>
          ))
        ) : (
          data.filter(d => d.ok).map(d => (
            <div key={d.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.ink, fontWeight: 600, minWidth: 50 }}>{d.label}</span>
              <Sparkline data={d.spark} color={d.changePct >= 0 ? C.up : C.down} prevClose={d.prevClose} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 90, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>
                  {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
                </span>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </MiniCard>
  );
}

function SectorPerformanceCard() {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(SECTOR_ETFS.map(s => fetchQuickQuote(s.symbol))).then(results => {
      if (cancelled) return;
      const items = SECTOR_ETFS.map((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...s, changePct: r.value.changePct, ok: true };
        return { ...s, changePct: 0, ok: false };
      }).filter(d => d.ok).sort((a, b) => b.changePct - a.changePct);
      setData(items);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const maxAbs = Math.max(...data.map(d => Math.abs(d.changePct)), 1);
  const barCap = Math.max(maxAbs, 0.5);

  return (
    <MiniCard title="Sector Performance">
      <div style={{ display: "grid", gap: 0 }}>
        {!loaded ? (
          SECTOR_ETFS.slice(0, 6).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <SkeletonBlock width={80} height={10} />
              <SkeletonBlock width="100%" height={10} />
              <SkeletonBlock width={40} height={10} />
            </div>
          ))
        ) : (
          data.map(d => {
            const pct = Math.abs(d.changePct);
            const barW = Math.min(100, (pct / barCap) * 100);
            const color = d.changePct >= 0 ? C.up : C.down;
            const opacity = 0.3 + 0.7 * Math.min(pct / barCap, 1);
            return (
              <div key={d.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, minWidth: 90, flexShrink: 0 }}>{d.label}</span>
                <div style={{ flex: 1, height: 8, background: C.paper, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barW}%`, background: color, opacity, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color, minWidth: 48, textAlign: "right" }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
            );
          })
        )}
      </div>
    </MiniCard>
  );
}

function YieldCurveCard() {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(YIELD_CURVE_TENORS.map(t => fetchQuickQuote(t.symbol))).then(results => {
      if (cancelled) return;
      const points = YIELD_CURVE_TENORS.map((t, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...t, yield: r.value.price, ok: true };
        return { ...t, yield: 0, ok: false };
      }).filter(d => d.ok);
      setData(points);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const isNormal = data.length >= 2 && data[data.length - 1].yield > data[0].yield;
  const lineColor = isNormal ? C.up : C.down;

  return (
    <MiniCard title="Yield Curve">
      {!loaded ? (
        <SkeletonBlock height={140} />
      ) : data.length < 2 ? (
        <div style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, padding: 20, textAlign: "center" }}>Yield data unavailable</div>
      ) : (
        <div style={{ width: "100%", height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "var(--mono)", fill: C.inkMuted }} axisLine={{ stroke: C.rule }} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fontFamily: "var(--mono)", fill: C.inkMuted }} axisLine={false} tickLine={false} width={30} tickFormatter={v => v.toFixed(1) + "%"} />
              <Tooltip contentStyle={{ background: C.warmWhite, border: `1px solid ${C.rule}`, fontSize: 11, fontFamily: "var(--mono)" }} formatter={v => [v.toFixed(2) + "%", "Yield"]} />
              <Line type="monotone" dataKey="yield" stroke={lineColor} strokeWidth={2} dot={{ fill: lineColor, r: 4 }} label={{ position: "top", fontSize: 10, fontFamily: "var(--mono)", fill: C.ink, formatter: v => v.toFixed(2) + "%" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </MiniCard>
  );
}

function PortfolioTileCard({ data }) {
  const changeColor = data.dayChangePct >= 0 ? C.up : C.down;
  return (
    <MiniCard title="Portfolio Snapshot">
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 30, fontFamily: "var(--display)", color: C.ink }}>{fmtMoney(data.value)}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: changeColor }}>
            {data.dayChangePct >= 0 ? "+" : ""}{data.dayChangePct.toFixed(2)}% today
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>YTD</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: C.up }}>{data.ytdPct.toFixed(2)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>Cash</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 }}>{fmtMoney(data.cash)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>Risk</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 }}>{data.risk}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.top.map(t => (
            <span key={t} style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "3px 8px", border: `1px solid ${C.rule}`, color: C.inkMuted }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </MiniCard>
  );
}

function ChangelogBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("changelog_dismissed_0.3.12") === "true"; } catch { return false; }
  });
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  return (
    <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
        <button onClick={() => setExpanded(!expanded)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>What's New v0.3.12</span>
          <span style={{ fontSize: 10, color: C.inkFaint, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
        </button>
        <button onClick={() => { setDismissed(true); try { localStorage.setItem("changelog_dismissed_0.3.12", "true"); } catch {} }}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: C.inkFaint, padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "grid", gap: 12 }}>
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: C.ink }}>v{entry.version}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.inkFaint }}>{entry.date}</span>
              </div>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {entry.items.map((it) => (
                  <div key={it} style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5, paddingLeft: 12, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: C.inkFaint }}>+</span>
                    {it}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetRow({ section, onAnalyze }) {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(section.symbols.map(s => fetchQuickQuote(s.symbol))).then(results => {
      if (cancelled) return;
      const items = section.symbols.map((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...s, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, ok: true };
        return { ...s, price: 0, changePct: 0, spark: [], ok: false };
      });
      setData(items);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [section]);

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "var(--mono)", marginBottom: 10 }}>
        {section.title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 2 }}>
        {!loaded ? (
          section.symbols.map((_, i) => (
            <div key={i} style={{ padding: "8px 10px" }}>
              <SkeletonBlock width={60} height={10} style={{ marginBottom: 4 }} />
              <SkeletonBlock width={80} height={14} />
            </div>
          ))
        ) : (
          data.filter(d => d.ok).map(d => (
            <button
              key={d.symbol}
              type="button"
              onClick={() => onAnalyze?.(d.symbol)}
              style={{
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 4,
                transition: "background 0.15s",
                minWidth: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.warmWhite}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
              <div style={{ fontSize: 15, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
              </div>
              {d.spark && d.spark.length > 1 && (
                <div style={{ opacity: 0.7 }}>
                  <Sparkline data={d.spark} color={d.changePct >= 0 ? C.up : C.down} />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════════════
function HomeTab({ onAnalyze, region = "Global", onRegionChange, greetingName }) {
  const [indexPage, setIndexPage] = useState(0);
  const [stripData, setStripData] = useState([]);
  const [stripLoading, setStripLoading] = useState(true);
  const [charts, setCharts] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [movers, setMovers] = useState(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [agoText, setAgoText] = useState("");

  // "Updated Xs ago" counter
  useEffect(() => {
    if (!lastRefresh) return;
    const tick = () => {
      const sec = Math.round((Date.now() - lastRefresh) / 1000);
      setAgoText(sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  const loadRegionData = useCallback(async (rgn, cancelled, skeleton) => {
    const cfg = MARKET_REGIONS[rgn];
    if (skeleton) { setStripLoading(true); setChartsLoading(true); }
    try {
      const data = await fetchTickerStrip(cfg.strip);
      if (!cancelled.current) { setStripData(data); setStripLoading(false); }
    } catch { if (!cancelled.current) setStripLoading(false); }
    try {
      const chartResults = await Promise.allSettled(cfg.charts.map(c => fetchIntradayData(c.symbol)));
      if (!cancelled.current) {
        setCharts(chartResults.map((r, i) => ({
          data: r.status === "fulfilled" ? r.value : null,
          label: cfg.charts[i].label,
        })));
        setChartsLoading(false);
        setLastRefresh(Date.now());
      }
    } catch { if (!cancelled.current) setChartsLoading(false); }
  }, []);

  const loadMovers = useCallback(async (rgn, cancelled) => {
    try {
      const universe = REGION_MOVERS[rgn] || HEATMAP_UNIVERSE;
      const data = await fetchMarketMovers(universe);
      if (!cancelled.current) { setMovers(data); setMoversLoading(false); }
    } catch { if (!cancelled.current) setMoversLoading(false); }
  }, []);

  const loadTrending = useCallback(async (cancelled) => {
    try {
      const results = await Promise.allSettled(DEFAULT_TRENDING.map(s => fetchQuickQuote(s.ticker)));
      if (!cancelled.current) {
        const stocks = DEFAULT_TRENDING.map((s, i) => {
          const r = results[i];
          if (r.status === "fulfilled") return { ...s, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, prevClose: r.value.prevClose, loaded: true };
          return { ...s, price: 0, changePct: 0, spark: [], loaded: false };
        }).filter(s => s.loaded);
        setTrending(stocks);
        setTrendingLoading(false);
      }
    } catch { if (!cancelled.current) setTrendingLoading(false); }
  }, []);

  useEffect(() => {
    const cancelled = { current: false };

    loadRegionData(region, cancelled, true);
    loadMovers(region, cancelled);
    loadTrending(cancelled);

    const loadNews = async () => {
      try {
        const data = await fetchRSSNews();
        if (!cancelled.current) { setNews(data); setNewsLoading(false); }
      } catch { if (!cancelled.current) { setNews(FALLBACK_NEWS); setNewsLoading(false); } }
    };
    loadNews();

    return () => { cancelled.current = true; };
  }, [region, loadRegionData, loadMovers, loadTrending]);

  // Live tickers polling — refreshes only strip + charts every 30s (lightweight)
  useEffect(() => {
    const cancelled = { current: false };
    const poll = () => {
      loadRegionData(region, cancelled, false);
    };
    const id = setInterval(poll, 30000);
    return () => { cancelled.current = true; clearInterval(id); };
  }, [region, loadRegionData]);

  const handleRegionChange = (rgn) => {
    if (rgn === region) return;
    onRegionChange?.(rgn);
    setIndexPage(0);
    setCharts([]);
    setMovers(null);
    setMoversLoading(true);
  };

  const cfg = MARKET_REGIONS[region];
  const INDEXES_PER_PAGE = 3;
  const totalIndexPages = Math.max(1, Math.ceil(cfg.charts.length / INDEXES_PER_PAGE));
  const safeIndexPage = Math.min(indexPage, totalIndexPages - 1);
  const pageCharts = cfg.charts.slice(
    safeIndexPage * INDEXES_PER_PAGE,
    safeIndexPage * INDEXES_PER_PAGE + INDEXES_PER_PAGE
  );
  const indexActions = totalIndexPages > 1 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.max(0, p - 1))}
        disabled={safeIndexPage === 0}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage === 0 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        ←
      </button>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
        {safeIndexPage + 1}/{totalIndexPages}
      </span>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.min(totalIndexPages - 1, p + 1))}
        disabled={safeIndexPage >= totalIndexPages - 1}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage >= totalIndexPages - 1 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        →
      </button>
    </div>
  ) : null;
  const regionTabStyle = (r) => ({
    padding: "6px 16px", border: `1px solid ${C.rule}`, borderRadius: 20,
    background: region === r ? C.ink : "transparent",
    color: region === r ? C.cream : C.inkMuted,
    fontSize: 11, fontFamily: "var(--body)", fontWeight: 600, cursor: "pointer",
    letterSpacing: "0.06em", transition: "all 0.15s",
  });

  const greetingVariantRef = useRef(Math.floor(Math.random() * 5));
  const dayPart = (() => {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    if (h < 22) return "evening";
    return "night";
  })();
  const greetingPhrases = greetingName ? [
    `Good ${dayPart}`,
    "Hey",
    "Welcome back",
    "Nice to see you",
    "Hello",
  ] : [
    `Good ${dayPart}`,
    "Market brief",
    "Quick pulse",
    "Snapshot",
    "Today's glance",
  ];
  const greetingBase = greetingPhrases[greetingVariantRef.current % greetingPhrases.length];
  const greetingText = greetingName ? `${greetingBase}, ${greetingName}` : greetingBase;

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      {/* Ticker Strip */}
      <TickerStrip data={stripData} loading={stripLoading} onAnalyze={onAnalyze} />

      {/* Region Selector + Updated timestamp */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {Object.keys(MARKET_REGIONS).map((r) => (
          <button key={r} onClick={() => handleRegionChange(r)} style={regionTabStyle(r)}>{r}</button>
        ))}
        {lastRefresh && (
          <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.04em" }}>
            Updated {agoText}
          </span>
        )}
      </div>

      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px 12px", marginTop: 6, marginBottom: 6 }}>
        <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <g stroke={C.accent} strokeWidth="1.6" strokeLinecap="round">
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.5" y1="4.5" x2="7.5" y2="7.5" />
              <line x1="16.5" y1="16.5" x2="19.5" y2="19.5" />
              <line x1="4.5" y1="19.5" x2="7.5" y2="16.5" />
              <line x1="16.5" y1="7.5" x2="19.5" y2="4.5" />
            </g>
            <circle cx="12" cy="12" r="3" fill={C.accent} />
          </svg>
        </span>
        <div style={{ fontSize: 22, fontFamily: "var(--display)", color: C.ink, letterSpacing: "-0.01em" }}>
          {greetingText}
        </div>
      </div>

      {/* Headlines + Indexes */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 0.6fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0, overflow: "hidden" }}>
          <Section title="Market News">
            <NewsSection news={news} loading={newsLoading} />
          </Section>
          <PortfolioTileCard data={PORTFOLIO_TILE} />
        </div>
        <Section title="Indexes" actions={indexActions} style={{ minWidth: 0 }}>
          <div key={safeIndexPage} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, animation: "fadeIn 0.25s ease" }}>
            {pageCharts.map((c) => {
              const idx = cfg.charts.findIndex(x => x.symbol === c.symbol);
              return (
                <MiniIntradayChart
                  key={c.symbol}
                  data={charts[idx]?.data}
                  label={c.label}
                  loading={chartsLoading && !charts[idx]?.data}
                  onAnalyze={onAnalyze}
                  ticker={c.symbol}
                  compact
                />
              );
            })}
          </div>
        </Section>
      </div>

      {/* Market Movers — 3 columns */}
      <LazySection minHeight={240}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <MoverColumn title="Top Gainers" stocks={movers?.gainers} allStocks={movers?.gainers} loading={moversLoading} onAnalyze={onAnalyze} />
          <MoverColumn title="Top Losers" stocks={movers?.losers} allStocks={movers?.losers} loading={moversLoading} onAnalyze={onAnalyze} />
          <MoverColumn title="Trending Stocks" stocks={trending} allStocks={trending} loading={trendingLoading} onAnalyze={onAnalyze} />
        </div>
      </LazySection>

      {/* Asset Class Sections */}
      <LazySection minHeight={200}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          {ASSET_SECTIONS.map(section => (
            <AssetRow key={section.title} section={section} onAnalyze={onAnalyze} />
          ))}
        </div>
      </LazySection>

      {/* Market Brief */}
      <LazySection minHeight={220}>
        <Section title="Market Brief">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
            <MarketScorecardCard />
            <CrossAssetCard />
            <SectorPerformanceCard />
            <YieldCurveCard />
          </div>
        </Section>
      </LazySection>

      {/* Changelog Banner */}
      <LazySection minHeight={120}>
        <ChangelogBanner />
      </LazySection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT TAB
// ═══════════════════════════════════════════════════════════
function AccountTab({
  onAnalyze,
  watchlist = [],
  alerts = [],
  recent = [],
  prefs,
  onAddWatchlist,
  onRemoveWatchlist,
  onAddAlert,
  onRemoveAlert,
  onOpenAuth,
  session,
  syncState,
  profileName,
  onUpdateName,
  onSignOut,
}) {
  const [subTab, setSubTab] = useState("overview");
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [nameInput, setNameInput] = useState(profileName || "");
  const [nameStatus, setNameStatus] = useState("");

  useEffect(() => {
    setNameInput(profileName || "");
  }, [profileName]);

  const syncLabel = !session
    ? "Local only"
    : syncState?.status === "syncing"
      ? "Syncing…"
      : syncState?.status === "error"
        ? "Sync error"
        : syncState?.last
          ? `Synced ${formatAgo(syncState.last)}`
          : "Synced";

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    try { await onAddWatchlist?.(t); } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    const t = alForm.ticker.trim().toUpperCase();
    const v = parseFloat(alForm.value);
    if (!t || Number.isNaN(v)) return;
    setBusy(true);
    try { await onAddAlert?.(t, alForm.type, v); } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  const saveName = async () => {
    const next = nameInput.trim();
    if (!next) { setNameStatus("Enter a first name."); return; }
    if (!session) { setNameStatus("Sign in to save."); return; }
    setProfileBusy(true);
    const res = await onUpdateName?.(next);
    if (res?.error) setNameStatus(res.error);
    else setNameStatus("Saved");
    setProfileBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint, marginBottom: 6 }}>Account Sync</div>
            <div style={{ fontSize: 13, color: C.ink, fontFamily: "var(--body)" }}>
              {session ? `Signed in as ${session?.user?.email || "user"}` : "Sign in to sync your account data across devices."}
            </div>
            {syncState?.error && <div style={{ fontSize: 11, color: C.down, fontFamily: "var(--body)", marginTop: 4 }}>{syncState.error}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>{syncLabel}</span>
            {!session && (
              <button onClick={onOpenAuth} style={{ padding: "8px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Sign In
              </button>
            )}
          </div>
        </div>

        <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint }}>Profile</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.ink, color: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontWeight: 700 }}>
              {(profileName || session?.user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="First name"
                style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 10px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }}
                disabled={!session} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={saveName} disabled={!session || profileBusy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: !session || profileBusy ? 0.5 : 1 }}>
                  Save
                </button>
                {session && (
                  <button onClick={onSignOut} style={{ padding: "6px 12px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)" }}>
                    Sign Out
                  </button>
                )}
                {nameStatus && <span style={{ fontSize: 10, color: nameStatus === "Saved" ? C.up : C.inkMuted, fontFamily: "var(--mono)" }}>{nameStatus}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}>
        {["overview", "preferences"].map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              background: "none",
              border: "none",
              color: subTab === t ? C.ink : C.inkMuted,
              fontSize: 11,
              fontWeight: subTab === t ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "var(--body)",
              borderBottom: subTab === t ? `2px solid ${C.ink}` : "none",
              paddingBottom: 6,
            }}
          >
            {t === "overview" ? "Overview" : "Preferences"}
          </button>
        ))}
      </div>

      {subTab === "overview" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Section title="Watchlist">
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder="Ticker"
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>ADD</button>
              </div>
              {watchlist.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>Empty watchlist</div>
              ) : (
                watchlist.map(w => (
                  <div key={w.ticker} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                        <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      </div>
                      {w.spark && w.spark.length > 1 && (
                        <div style={{ marginTop: 6, opacity: 0.7 }}>
                          <Sparkline data={w.spark} color={w.change >= 0 ? C.up : C.down} prevClose={w.prevClose} width={160} height={44} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>{w.rec}</span>
                      <button onClick={() => onAnalyze(w.ticker)} style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink, fontSize: 10, fontFamily: "var(--body)", padding: "4px 8px", cursor: "pointer" }}>Analyze</button>
                      <button onClick={() => onRemoveWatchlist?.(w.ticker)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>

            <Section title="Alerts">
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder="Ticker"
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">Above</option><option value="below">Below</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>SET</button>
              </div>
              {alerts.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>No alerts</div>
              ) : (
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? "TRIGGERED" : "WATCHING"}</span>
                      <button onClick={() => onRemoveAlert?.(a.id)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>

          <Section title="Recent Analyses">
            {recent.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>No analyses yet</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recent.map(r => {
                  const regimeLabel = shortRegimeLabel(r.regime);
                  const riskTone = r.riskLevel === "HIGH" ? C.down : r.riskLevel === "MEDIUM" ? C.hold : C.up;
                  return (
                    <button
                      key={`${r.ticker}-${r.ts || r.timestamp}`}
                      onClick={() => onAnalyze(r.ticker)}
                      style={{ textAlign: "left", border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", cursor: "pointer" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13 }}>{r.ticker}</span>
                          <span style={{ color: recColor(r.action), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>{r.action || "NEUTRAL"}</span>
                          <span style={{ color: C.inkFaint, fontSize: 10, fontFamily: "var(--mono)" }}>{r.period || prefs?.period}/{r.interval || prefs?.interval}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)", marginTop: 4 }}>
                          {r.price != null ? `$${fmt(r.price)}` : "—"} · {formatAgo(r.ts || r.timestamp)}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: recColor(r.action), display: "inline-block" }} />
                            Signal {r.action || "NEUTRAL"}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
                            Regime {regimeLabel}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: riskTone, display: "inline-block" }} />
                            Risk {r.riskLevel || "—"}
                          </span>
                          {r.confidence != null && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.inkSoft, display: "inline-block" }} />
                              Conf {Math.round(r.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {r.spark && r.spark.length > 1 && (
                          <Sparkline data={r.spark} prevClose={r.prevClose} color={recColor(r.action)} width={200} height={64} />
                        )}
                        <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>View →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      ) : (
        <Section title="Preferences">
          <div style={{ display: "grid", gap: 6 }}>
            <Row label="Default Period" value={prefs?.period || "1y"} />
            <Row label="Default Interval" value={prefs?.interval || "1d"} />
            <Row label="Home Region" value={prefs?.region || "Global"} border={false} />
          </div>
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS TAB
// ═══════════════════════════════════════════════════════════
function AnalysisTab({ result, livePrice, chartLivePrice, latency, isPro, period, interval, onReanalyze, onOpenCharts, openChartsLabel, helpMode, onShowHelp, onHideHelp }) {
  const [subTab, setSubTab] = useState("stock");
  const [finPeriod, setFinPeriod] = useState("LTM");
  const [assumptions, setAssumptions] = useState(null);
  const [chartType, setChartType] = useState("line");
  const peerSeed = hashCode(result?.ticker || "PEERS");
  const price = livePrice || result?.currentPrice || 0;
  const prevAnimated = usePrevious(price) ?? price;
  const baseAssumptions = assumptions || result?.valuationModels?.assumptions;
  const liveModels = useMemo(() => runValuationModels(baseAssumptions, price), [baseAssumptions, price]);
  const finSeries = useMemo(() => {
    const periods = result?.fundamentals?.periods || [];
    return periods.slice().reverse().map(p => ({
      period: p.label,
      revenue: (p.revenue || 0) / 1e9,
      netIncome: (p.netIncome || 0) / 1e9,
      fcf: (p.fcf || 0) / 1e9,
      fcfMargin: p.revenue ? ((p.fcf || 0) / p.revenue) * 100 : 0,
      grossMargin: (p.grossMargin || 0) * 100,
      opMargin: (p.opMargin || 0) * 100,
      netMargin: (p.netMargin || 0) * 100,
    }));
  }, [result]);

  const epsSeries = useMemo(() => {
    const shares = result?.fundamentals?.shares || 0;
    if (!shares) return [];
    return finSeries.map(p => ({
      period: p.period,
      eps: (p.netIncome * 1e9) / shares,
    }));
  }, [finSeries, result?.fundamentals?.shares]);
  const ratioSeries = useMemo(() => {
    const labels = ["Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25"];
    const baseCurrent = result?.fundamentals?.ratios?.currentRatio ?? 1.6;
    const baseDebt = result?.fundamentals?.debtToEquity ?? 0.8;
    const baseRoe = (result?.fundamentals?.ratios?.roe ?? 0.15) * 100;
    return labels.map((label, i) => ({
      label,
      currentRatio: baseCurrent * (0.85 + seededRange(peerSeed, 90 + i, 0.85, 1.15)),
      debtToEquity: baseDebt * (0.85 + seededRange(peerSeed, 120 + i, 0.8, 1.2)),
      roe: baseRoe * (0.85 + seededRange(peerSeed, 160 + i, 0.8, 1.2)),
    }));
  }, [peerSeed, result?.fundamentals?.ratios?.currentRatio, result?.fundamentals?.debtToEquity, result?.fundamentals?.ratios?.roe]);


  const targetSeries = useMemo(() => {
    const raw = result?.data || [];
    if (!raw.length) return [];
    const byDay = new Map();
    raw.forEach(d => {
      const day = d.date.slice(0, 10);
      byDay.set(day, d);
    });
    const daily = Array.from(byDay.values());
    const tail = daily.slice(-252);
    if (!tail.length) return [];
    const last = tail[tail.length - 1].Close;
    const target = last * seededRange(peerSeed, 88, 1.1, 1.35);
    return tail.map((d, i) => ({
      i,
      date: d.date,
      past: d.Close,
      target: i === tail.length - 1 ? target : null,
      targetLine: target,
    }));
  }, [result?.data, peerSeed]);

  const chartBase = useMemo(
    () => applyLivePoint(result?.data || [], chartLivePrice, interval || result?.interval),
    [result?.data, chartLivePrice, interval, result?.interval]
  );

  useEffect(() => {
    if (!result) return;
    setSubTab("stock");
    setFinPeriod(result.fundamentals?.periods?.[0]?.label || "LTM");
    setAssumptions(result.valuationModels?.assumptions || null);
    setChartType("line");
  }, [result]);

  if (!result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 14 }}>
        <BrandMark size={26} muted />
        <div style={{ fontSize: 26, fontFamily: "var(--display)", color: C.inkSoft, marginTop: 10, fontWeight: 400 }}>Enter a ticker to begin</div>
        <div style={{ fontSize: 13, color: C.inkMuted, fontFamily: "var(--body)" }}>Type a symbol above and press Analyze</div>
      </div>
    );
  }

  const { ticker, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, valuation: marketValuation, fundamentals, valuationModels } = result;
  const strat = STRATEGIES[regime.overall] || STRATEGIES.TRANSITIONING;
  const stretchPos = Math.min(100, Math.max(0, marketValuation?.stretch || 0));
  const prevClose = chartBase.length > 1 ? chartBase[chartBase.length - 2].Close : price;
  const change = price - prevClose, pctChange = (change / prevClose) * 100;
  const chartSlice = chartBase.slice(-60);
  const chartData = chartSlice.map((d, i) => {
    const isLast = i === chartSlice.length - 1;
    const live = isLast && chartLivePrice != null ? chartLivePrice : d.Close;
    const high = isLast && chartLivePrice != null ? Math.max(d.High ?? live, live) : d.High;
    const low = isLast && chartLivePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
    return { n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, s20: d.SMA_20, s50: d.SMA_50, bu: d.BB_Upper, bl: d.BB_Lower };
  });
  const finData = fundamentals?.periods?.find(p => p.label === finPeriod) || fundamentals?.periods?.[0];
  const marginRadar = [
    { metric: "Gross", value: (finData?.grossMargin || 0) * 100 },
    { metric: "Operating", value: (finData?.opMargin || 0) * 100 },
    { metric: "Net", value: (finData?.netMargin || 0) * 100 },
    { metric: "FCF", value: finData?.revenue ? ((finData.fcf || 0) / finData.revenue) * 100 : 0 },
  ];
  const radarMax = Math.max(60, ...marginRadar.map(m => m.value || 0));
  const cashDebt = [
    { name: "Cash", value: fundamentals?.cash || 0, color: C.up },
    { name: "Debt", value: fundamentals?.debt || 0, color: C.down },
  ];
  const netCash = (fundamentals?.cash || 0) - (fundamentals?.debt || 0);
  const updateAssumption = (key, value) => {
    setAssumptions(prev => ({ ...(prev || valuationModels?.assumptions || {}), [key]: value }));
  };
  const inputVal = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : "";
  const subTabStyle = (t, locked = false) => ({
    padding: "6px 0", marginRight: 18, background: "none", border: "none",
    borderBottom: subTab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: subTab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 11, fontWeight: subTab === t ? 700 : 500,
    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
  });
  const chartToggle = (on) => ({
    padding: "4px 10px",
    border: `1px solid ${on ? C.ink : C.rule}`,
    background: on ? C.ink : "transparent",
    color: on ? C.cream : C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
  const openChartsBtn = {
    padding: "4px 10px",
    border: `1px solid ${C.rule}`,
    background: "transparent",
    color: C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
  const inputStyle = {
    width: "100%",
    background: "transparent",
    border: `1px solid ${C.rule}`,
    padding: "6px 8px",
    fontSize: 12,
    fontFamily: "var(--mono)",
    color: C.ink,
    outline: "none",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, marginBottom: 18 }}>
        <button onClick={() => setSubTab("stock")} style={subTabStyle("stock")}>Stock</button>
        <button onClick={() => setSubTab("financials")} style={subTabStyle("financials", !isPro)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Financials
            {!isPro && <ProTag small />}
          </span>
        </button>
      </div>

      {subTab === "stock" && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 14, color: C.inkMuted, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{ticker}</span>
                {result.source && <LiveBadge latency={latency || result.latency} source={result.source} />}
              </div>
              <AnimatedPrice price={price} prevPrice={prevAnimated} large />
              <div style={{ fontSize: 16, fontWeight: 600, color: change >= 0 ? C.up : C.down, fontFamily: "var(--mono)", marginTop: 4 }}>
                {change >= 0 ? "+" : ""}{fmt(change)} ({change >= 0 ? "+" : ""}{fmt(pctChange, 2)}%)
              </div>
            </div>
            <div style={{ padding: "16px 0", borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontFamily: "var(--body)" }}>Verdict</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: recColor(rec.action), fontFamily: "var(--display)", lineHeight: 1 }}>{rec.action}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, fontFamily: "var(--body)" }}>
                <span style={{ color: C.inkMuted }}>Confidence <strong style={{ color: C.ink }}>{fmtPct(rec.confidence * 100, 0)}</strong></span>
                <span style={{ color: C.inkMuted }}>Score <strong style={{ color: C.ink }}>{fmt(rec.score)}</strong></span>
              </div>
              {liveModels?.anchor && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>Valuation Anchor</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: C.inkSoft, marginTop: 4 }}>
                    {liveModels.signal} · ${fmt(liveModels.anchor)} {liveModels.upside != null && `(${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)})`}
                  </div>
                </div>
              )}
            </div>
            {target && (
              <Section title="Price Targets">
                <Row label="Target" value={`$${fmt(target)}`} color={C.up} />
                <Row label="Stop Loss" value={`$${fmt(stopLoss)}`} color={C.down} />
                <Row label="Risk / Reward" value={`${fmt(Math.abs(target - price) / Math.abs(price - (stopLoss || price)))}x`} border={false} />
              </Section>
            )}
            <Section title="Technical Signals">
              {Object.entries(techSignals).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                  <span style={{ color: C.inkMuted, fontSize: 12 }}>{k}</span><Signal value={v} />
                </div>
              ))}
            </Section>
            <Section title="Risk Profile">
              <Row label="Risk Level" value={risk.riskLevel} color={risk.riskLevel === "HIGH" ? C.down : risk.riskLevel === "MEDIUM" ? C.hold : C.up} />
              <Row label="Volatility" value={fmtPct(risk.volatility)} />
              <Row label="Max Drawdown" value={fmtPct(risk.maxDrawdown)} color={C.down} />
              <Row label="Sharpe" value={fmt(risk.sharpe)} color={risk.sharpe > 1 ? C.up : risk.sharpe > 0 ? C.hold : C.down} />
              <Row label="Sortino" value={fmt(risk.sortino)} />
              <Row label="VaR 95%" value={fmtPct(risk.var95)} color={C.down} border={false} />
            </Section>
            <Section title="Statistical Signals">
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {[
                  { key: "zscore", label: "Z-Score", desc: "Price deviation from 20-period mean", value: statSignals.zscore.zscore, unit: "σ", range: [-3, 3] },
                  { key: "momentum", label: "Momentum", desc: "Avg return across 5, 10, 20, 50-day periods", value: statSignals.momentum.avgMomentum, unit: "%", range: [-10, 10] },
                  { key: "volume", label: "Volume", desc: "Current volume vs 20-period avg", value: statSignals.volume.volumeZscore, unit: "σ", range: [-3, 3] },
                  { key: "aggregate", label: "Composite", desc: "Weighted combination of all signals", value: statSignals.aggregate.score, unit: "", range: [-2, 2] },
                ].map(({ key, label, desc, value, unit, range }) => {
                  const sig = statSignals[key];
                  const pct = Math.min(100, Math.max(0, ((value - range[0]) / (range[1] - range[0])) * 100));
                  const gaugeColor = sig.signal.includes("BUY") ? C.up : sig.signal.includes("SELL") ? C.down : C.hold;
                  return (
                    <div key={key} style={{ padding: "12px 14px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--body)" }}>{label}</div>
                          <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 1 }}>{desc}</div>
                        </div>
                        <Signal value={sig.signal} />
                      </div>
                      <div style={{ position: "relative", height: 8, background: C.paper, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: `linear-gradient(90deg, ${C.up}33, ${C.holdBg}, ${C.down}33)` }} />
                        <div style={{ position: "absolute", left: `calc(${pct}% - 5px)`, top: -1, width: 10, height: 10, borderRadius: "50%", background: gaugeColor, border: `2px solid ${C.cream}`, boxShadow: `0 0 6px ${gaugeColor}44` }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)" }}>
                        <span style={{ color: C.up, fontWeight: 600 }}>Buy</span>
                        <span style={{ color: C.inkSoft, fontWeight: 700 }}>{fmt(value, 2)}{unit}</span>
                        <span style={{ color: C.down, fontWeight: 600 }}>Sell</span>
                      </div>
                      {key === "momentum" && sig.byPeriod && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}` }}>
                          {Object.entries(sig.byPeriod).map(([period, val]) => (
                            <div key={period} style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)" }}>{period}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: val >= 0 ? C.up : C.down }}>
                                {val >= 0 ? "+" : ""}{fmt(val, 1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {key === "volume" && (
                        <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}`, fontSize: 10, fontFamily: "var(--mono)" }}>
                          <div><span style={{ color: C.inkFaint }}>Current </span><span style={{ color: C.ink, fontWeight: 600 }}>{sig.currentVolume ? (sig.currentVolume / 1e6).toFixed(1) + "M" : "—"}</span></div>
                          <div><span style={{ color: C.inkFaint }}>Avg </span><span style={{ color: C.ink, fontWeight: 600 }}>{sig.avgVolume ? (sig.avgVolume / 1e6).toFixed(1) + "M" : "—"}</span></div>
                        </div>
                      )}
                      {key === "aggregate" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}` }}>
                          <div style={{ flex: 1, textAlign: "center", padding: "4px 0", background: C.paper, fontSize: 9, fontFamily: "var(--body)" }}>
                            <div style={{ color: C.inkFaint }}>Confidence</div>
                            <div style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 13 }}>{fmtPct(sig.confidence * 100, 0)}</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", padding: "4px 0", background: C.paper, fontSize: 9, fontFamily: "var(--body)" }}>
                            <div style={{ color: C.inkFaint }}>Direction</div>
                            <div style={{ fontWeight: 700, color: gaugeColor, fontFamily: "var(--mono)", fontSize: 11 }}>{sig.signal.replace("STRONG_", "").replace("_", " ")}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <HelpWrap
          enabled={helpMode}
          onShow={onShowHelp}
          onHide={onHideHelp}
          block
          help={{
            title: "Price Chart",
            body: "Shows the last 60 sessions with live overlays and indicators. Use the controls to change period or interval.",
          }}
        >
          <Section title="Price — Last 60 Sessions" actions={
            (onReanalyze || onOpenCharts) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {onOpenCharts && (
                  <button
                    onClick={() => onOpenCharts({ mode: "price", title: `${ticker} — Full Period` })}
                    style={openChartsBtn}
                  >
                    {openChartsLabel || "Open in Charts"}
                  </button>
                )}
                {onReanalyze && (
                  <>
                    <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                      style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                      {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                    <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                      {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </>
                )}
              </div>
            )
          }>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setChartType("line")} style={chartToggle(chartType === "line")}>Line</button>
            <button onClick={() => setChartType("candles")} style={chartToggle(chartType === "candles")}>Candles</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
              <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={9} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
              <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name="BB Upper" />
              <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name="BB Lower" />
              <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} name="SMA 20" />
              <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} name="SMA 50" />
              {chartType === "candles" ? (
                <Customized component={CandlestickSeries} />
              ) : (
                <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={2} name="Close" isAnimationActive animationDuration={CHART_ANIM_MS} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </Section>
        </HelpWrap>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Section title="Valuation Analysis">
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(marketValuation.verdict), fontFamily: "var(--display)", marginBottom: 10, lineHeight: 1.2 }}>{marketValuation.verdict}</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Stretch Index</div>
                  <div style={{ height: 10, background: C.paper, position: "relative", overflow: "hidden", borderRadius: 6 }}>
                    <div style={{ position: "absolute", left: 6, right: 6, top: 4, height: 2, background: `linear-gradient(90deg, ${C.up}, ${C.hold}, ${C.down})` }} />
                    <div style={{
                      position: "absolute",
                      left: `calc(${stretchPos}% - 5px)`,
                      top: 1,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: C.ink,
                      boxShadow: "0 0 8px rgba(26,22,18,0.25)"
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint }}>
                    <span>Undervalued</span><span>{fmt(marketValuation.stretch, 0)}/100</span><span>Overvalued</span>
                  </div>
                </div>
                <Row label="vs SMA 200" value={`${marketValuation.devSma200 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma200)}`} color={Math.abs(marketValuation.devSma200) > 15 ? C.down : C.inkSoft} />
                <Row label="vs SMA 50" value={`${marketValuation.devSma50 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma50)}`} />
                <Row label="Bollinger %B" value={fmt(marketValuation.pctB, 2)} color={marketValuation.pctB > 0.8 ? C.down : marketValuation.pctB < 0.2 ? C.up : C.hold} />
                <Row label="52W Range" value={`${fmtPct(marketValuation.range52Pct, 0)} from low`} />
                <Row label="Fair Value Est." value={`$${fmt(marketValuation.fairValue)}`} color={price > marketValuation.fairValue * 1.1 ? C.down : price < marketValuation.fairValue * 0.9 ? C.up : C.hold} border={false} />
              </Section>
              <Section title="Market Regime">
                <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: "var(--display)", marginBottom: 12, lineHeight: 1.2 }}>{regime.overall.replace(/_/g, " ")}</div>
                <Row label="Direction" value={regime.trend.direction} color={regime.trend.direction === "UPTREND" ? C.up : regime.trend.direction === "DOWNTREND" ? C.down : C.hold} />
                <Row label="Strength" value={`${fmt(regime.trend.strength, 0)} / 100`} />
                <Row label="Volatility" value={regime.volatility.classification} />
                <Row label="Hurst" value={fmt(regime.hurst, 3)} color={regime.hurst > 0.5 ? C.up : C.down} />
                <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${C.accent}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, fontFamily: "var(--body)" }}>{strat.strategy}</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, lineHeight: 1.5, fontFamily: "var(--body)" }}>{strat.tactics.join(" · ")}</div>
                  <div style={{ fontSize: 10, color: C.down, marginTop: 4, fontFamily: "var(--body)" }}>Avoid: {strat.avoid.join(", ")}</div>
                </div>
              </Section>
            </div>
            <LazySection minHeight={260}>
              <Section title="Analyst Price Targets">
                <div style={{ padding: "12px 14px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={targetSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="i" hide />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                      <Line dataKey="past" stroke={C.ink} dot={false} strokeWidth={2} name="Past 12 months" />
                      <Line dataKey="targetLine" stroke="#3B82F6" dot={false} strokeWidth={2} strokeDasharray="4 4" name="12-month target" />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.ink, marginRight: 6 }} />Past 12 months</span>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3B82F6", marginRight: 6 }} />12-month price target</span>
                  </div>
                </div>
              </Section>
            </LazySection>
            <LazySection minHeight={420}>
              <Section title="Company Metrics">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                  <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Earnings Per Share</div>
                    {epsSeries.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={epsSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                          <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                          <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                            formatter={(v) => [`$${fmt(v, 2)}`, "EPS"]} />
                          <Line type="monotone" dataKey="eps" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)" }}>EPS series unavailable.</div>
                    )}
                  </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Revenue</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={finSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${fmt(v, 0)}B`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`$${fmt(v, 2)}B`, "Revenue"]} />
                      <Line type="monotone" dataKey="revenue" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Net Profit Margin</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={finSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${fmt(v, 0)}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 1)}%`, "Net Margin"]} />
                      <Line type="monotone" dataKey="netMargin" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Current Ratio</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}`, "Current Ratio"]} />
                      <Line type="monotone" dataKey="currentRatio" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Debt to Equity</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}`, "Debt / Equity"]} />
                      <Line type="monotone" dataKey="debtToEquity" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>Return on Equity (TTM)</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${fmt(v, 0)}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}%`, "ROE"]} />
                      <Line type="monotone" dataKey="roe" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>
          </LazySection>
          </div>
        </div>
      )}

      {subTab === "financials" && !isPro && (
        <ProGate
          title="Financials Are Pro"
          description="Unlock company financials, valuation tooling, and multi-period statement analysis."
          features={["Income statements · Cash flow · Balance sheet", "DCF, DDM, and multiples modeling", "Historical margin and growth trends"]}
        />
      )}

      {subTab === "financials" && isPro && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Section title="Fundamental Snapshot">
              <Row label="Market Cap" value={fmtMoney(fundamentals?.marketCap)} />
              <Row label="Revenue" value={fmtMoney(finData?.revenue)} />
              <Row label="Net Income" value={fmtMoney(finData?.netIncome)} />
              <Row label="Free Cash Flow" value={fmtMoney(finData?.fcf)} />
              <Row label="Revenue Growth" value={fmtPct((fundamentals?.revenueGrowth || 0) * 100, 1)} />
              <Row label="Gross Margin" value={fmtPct((finData?.grossMargin || 0) * 100)} />
              <Row label="Operating Margin" value={fmtPct((finData?.opMargin || 0) * 100)} />
              <Row label="Net Margin" value={fmtPct((finData?.netMargin || 0) * 100)} border={false} />
            </Section>
            <Section title="Balance Sheet">
              <Row label="Cash" value={fmtMoney(fundamentals?.cash)} />
              <Row label="Debt" value={fmtMoney(fundamentals?.debt)} />
              <Row label="Debt / Equity" value={fmt(fundamentals?.debtToEquity, 2)} />
              <Row label="Current Ratio" value={fmt(fundamentals?.ratios?.currentRatio, 2)} border={false} />
            </Section>
            <Section title="Per Share">
              <Row label="EPS" value={`$${fmt(fundamentals?.perShare?.eps, 2)}`} />
              <Row label="FCF / Share" value={`$${fmt(fundamentals?.perShare?.fcfPerShare, 2)}`} />
              <Row label="Dividend / Share" value={`$${fmt(fundamentals?.perShare?.dividendPerShare, 2)}`} border={false} />
            </Section>
            <Section title="Key Ratios">
              <Row label="ROE" value={fmtPct((fundamentals?.ratios?.roe || 0) * 100, 1)} color={(fundamentals?.ratios?.roe || 0) > 0.15 ? C.up : C.hold} />
              <Row label="ROA" value={fmtPct((fundamentals?.ratios?.roa || 0) * 100, 1)} />
              <Row label="P/E" value={fundamentals?.perShare?.eps > 0 ? fmt(price / fundamentals.perShare.eps, 1) : "—"} />
              <Row label="P/FCF" value={fundamentals?.perShare?.fcfPerShare > 0 ? fmt(price / fundamentals.perShare.fcfPerShare, 1) : "—"} border={false} />
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Section title="Financials Overview">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>Revenue + FCF Margin</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={finSeries} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={(v) => `$${v}B`} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 60]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32}
                        tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                        formatter={(v, name) => [name === "FCF Margin" ? `${fmt(v, 1)}%` : `$${fmt(v, 2)}B`, name]} />
                      <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill={C.inkSoft + "AA"} radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="fcf" name="FCF" fill={C.accent + "AA"} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="fcfMargin" name="FCF Margin" stroke={C.up} dot={{ fill: C.up, r: 3 }} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>Margin Trends</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={finSeries} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                        formatter={(v) => [`${fmt(v, 1)}%`]} />
                      <Line type="monotone" dataKey="grossMargin" name="Gross" stroke={C.up} dot={{ fill: C.up, r: 3 }} strokeWidth={2} />
                      <Line type="monotone" dataKey="opMargin" name="Operating" stroke={C.accent} dot={{ fill: C.accent, r: 3 }} strokeWidth={2} />
                      <Line type="monotone" dataKey="netMargin" name="Net" stroke={C.chart4} dot={{ fill: C.chart4, r: 3 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4, fontSize: 9, fontFamily: "var(--mono)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.up }} />Gross</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.accent }} />Operating</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.chart4 }} />Net</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>Margin Radar</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <RadarChart data={marginRadar}>
                      <PolarGrid stroke={C.ruleFaint} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} />
                      <PolarRadiusAxis angle={90} domain={[0, radarMax]} tick={{ fill: C.inkFaint, fontSize: 8, fontFamily: "var(--mono)" }} />
                      <Radar dataKey="value" stroke={C.ink} fill={C.accent + "55"} strokeWidth={1.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>Cash vs Debt</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={cashDebt} dataKey="value" nameKey="name" innerRadius={32} outerRadius={50} paddingAngle={2} stroke="none">
                        {cashDebt.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [fmtMoney(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>
                    <span>Net Cash</span>
                    <span style={{ color: netCash >= 0 ? C.up : C.down, fontWeight: 700 }}>{fmtMoney(netCash)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6, fontSize: 9, fontFamily: "var(--mono)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, background: C.up, borderRadius: 2 }} />Cash {fmtMoney(fundamentals?.cash)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, background: C.down, borderRadius: 2 }} />Debt {fmtMoney(fundamentals?.debt)}</span>
                  </div>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>Earnings Per Share</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={finSeries} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={30} tickFormatter={v => `$${v.toFixed(0)}B`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`$${fmt(v, 2)}B`]} />
                      <Bar dataKey="netIncome" name="Net Income" fill={C.chart4 + "BB"} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ textAlign: "center", fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint, marginTop: 4 }}>Net Income by Period</div>
                </div>
              </div>
            </Section>
            <Section title="Fundamental Data Aggregator">
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                Collects revenue, earnings, margins, debt, and cash flow by ticker and fiscal period. Designed to plug into APIs or SEC filings — this build uses modeled data for demonstration.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)" }}>Fiscal Period</span>
                <select value={finPeriod} onChange={e => setFinPeriod(e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}>
                  {(fundamentals?.periods || []).map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>Source: {fundamentals?.source}</span>
              </div>
              <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--mono)" }}>
                  <thead>
                    <tr style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkMuted }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Period</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Revenue</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Net Income</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>FCF</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Net Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fundamentals?.periods || []).map(p => (
                      <tr key={p.label} onClick={() => setFinPeriod(p.label)}
                        style={{ background: p.label === finPeriod ? C.paper : "transparent", cursor: "pointer", borderBottom: `1px solid ${C.ruleFaint}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.label}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.revenue)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.netIncome)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.fcf)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtPct((p.netMargin || 0) * 100, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title="Valuation Model Toolkit">
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                Estimates intrinsic value using DCF, dividend discount, and multiples analysis. Use auto-estimates or override assumptions below to run what-if scenarios.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>FCF / Share</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.fcfPerShare)} onChange={e => updateAssumption("fcfPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>EPS</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.eps)} onChange={e => updateAssumption("eps", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Dividend / Share</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.dividendPerShare)} onChange={e => updateAssumption("dividendPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Growth (5y %)</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.growthRate || 0) * 100, 1)} onChange={e => updateAssumption("growthRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Discount / WACC %</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.discountRate || 0) * 100, 1)} onChange={e => updateAssumption("discountRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Terminal Growth %</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.terminalGrowth || 0) * 100, 1)} onChange={e => updateAssumption("terminalGrowth", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Target P/E</div>
                  <input type="number" step="0.1" value={inputVal(assumptions?.targetPE, 1)} onChange={e => updateAssumption("targetPE", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Projection Years</div>
                  <input type="number" step="1" min="3" max="10" value={inputVal(assumptions?.years, 0)} onChange={e => updateAssumption("years", Math.max(1, parseInt(e.target.value || "0", 10)))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 12 }}>
                {[
                  ["DCF", liveModels.dcf],
                  ["Dividend Discount", liveModels.ddm],
                  ["Multiples", liveModels.multiples],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: "8px 10px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink }}>{value ? `$${fmt(value)}` : "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>Valuation Anchor</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(liveModels.signal), fontFamily: "var(--display)", marginTop: 4 }}>{liveModels.signal}</div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, fontFamily: "var(--mono)" }}>
                  Anchor {liveModels.anchor ? `$${fmt(liveModels.anchor)}` : "—"} · Upside {liveModels.upside != null ? `${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)}` : "—"}
                </div>
                <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 4, fontFamily: "var(--body)" }}>Used as long-term context alongside technical signals.</div>
              </div>
              {liveModels.issues.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.down, fontFamily: "var(--body)" }}>
                  {liveModels.issues.join(" ")}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHARTS TAB
// ═══════════════════════════════════════════════════════════
function ChartsTab({ result, chartLivePrice, period, interval, onReanalyze, intent, onConsumeIntent }) {
  const [show, setShow] = useState({ sma: true, bb: true, vol: true, rsi: true, macd: false, stoch: false });
  const [chartType, setChartType] = useState("line");
  const [expanded, setExpanded] = useState(null);
  const data = result?.data;
  const ticker = result?.ticker || "";
  const toggle = k => setShow(p => ({ ...p, [k]: !p[k] }));
  const cd = useMemo(() => {
    if (!data || !data.length) return [];
    const base = applyLivePoint(data, chartLivePrice, interval || result?.interval);
    return base.map((d, i) => {
      const isLast = i === base.length - 1;
      const live = isLast && chartLivePrice != null ? chartLivePrice : d.Close;
      const high = isLast && chartLivePrice != null ? Math.max(d.High ?? live, live) : d.High;
      const low = isLast && chartLivePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
      return {
        n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, v: d.Volume,
        s20: d.SMA_20, s50: d.SMA_50, s200: d.SMA_200, bu: d.BB_Upper, bl: d.BB_Lower, bm: d.BB_Middle,
        rsi: d.RSI, macd: d.MACD, ms: d.MACD_Signal, mh: d.MACD_Hist, sk: d.Stoch_K, sd: d.Stoch_D
      };
    });
  }, [data, chartLivePrice, interval, result?.interval]);
  const btn = (on) => ({ padding: "5px 14px", border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.cream : C.inkMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.04em" });
  const h = show.rsi || show.macd || show.stoch ? 260 : 380;
  const expandBtn = { padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" };

  useEffect(() => {
    setChartType("line");
    setExpanded(null);
  }, [result?.ticker]);

  useEffect(() => {
    if (!intent || !result) return;
    setExpanded({ mode: intent.mode || "price", title: intent.title || `${ticker} — Full Period` });
    onConsumeIntent?.();
  }, [intent, result, ticker, onConsumeIntent]);

  if (!result) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.inkMuted, fontFamily: "var(--display)", fontSize: 24 }}>Run an analysis first</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}`, paddingBottom: 12, alignItems: "center" }}>
        {[["sma", "Moving Avg"], ["bb", "Bollinger"], ["vol", "Volume"], ["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastic"]].map(([k, l]) => (
          <button key={k} onClick={() => toggle(k)} style={btn(show[k])}>{l}</button>
        ))}
        <span style={{ marginLeft: 8, fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.1em" }}>Chart</span>
        <button onClick={() => setChartType("line")} style={btn(chartType === "line")}>Line</button>
        <button onClick={() => setChartType("candles")} style={btn(chartType === "candles")}>Candles</button>
        {onReanalyze && (
          <>
            <span style={{ marginLeft: 8, fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.1em" }}>Period</span>
            <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
              {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
            <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
              {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </>
        )}
      </div>
      <Section title={`${ticker} — Full Period`} actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "price", title: `${ticker} — Full Period` })}>Expand</button>}>
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={cd} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
            <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(cd.length / 12)} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
            {show.bb && <><Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bm" stroke={C.inkFaint} dot={false} strokeWidth={1} opacity={0.4} /></>}
            {show.sma && <><Line dataKey="s20" stroke={C.accent} dot={false} strokeWidth={1} /><Line dataKey="s50" stroke={C.chart4} dot={false} strokeWidth={1} /><Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} /></>}
            {chartType === "candles" ? <Customized component={CandlestickSeries} /> : <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive animationDuration={CHART_ANIM_MS} />}
            <Brush dataKey="n" height={18} stroke={C.rule} fill={C.warmWhite} travellerWidth={7} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      {show.vol && (
        <LazySection minHeight={120}>
          <Section title="Volume" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "volume", title: `${ticker} — Volume` })}>Expand</button>}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={cd} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="n" hide /><YAxis hide />
                <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </LazySection>
      )}
      <LazySection minHeight={180}>
        <div style={{ display: "grid", gridTemplateColumns: [show.rsi, show.macd, show.stoch].filter(Boolean).length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
          {show.rsi && (
            <Section title="RSI (14)" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "rsi", title: `${ticker} — RSI (14)` })}>Expand</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.macd && (
            <Section title="MACD" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "macd", title: `${ticker} — MACD` })}>Expand</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <ComposedChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.stoch && (
            <Section title="Stochastic" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "stoch", title: `${ticker} — Stochastic` })}>Expand</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
        </div>
      </LazySection>
      {expanded && (
        <ExpandedChartModal
          title={expanded.title}
          mode={expanded.mode}
          data={cd}
          dataKey={ticker}
          onClose={() => setExpanded(null)}
          period={period}
          interval={interval}
          onReanalyze={onReanalyze}
          ticker={ticker}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HEATMAP TAB (Treemap: size=cap, color=Sharpe)
// ═══════════════════════════════════════════════════════════
function squarify(items, W, H) {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.size, 0);
  const scaled = items.map(i => ({ ...i, area: (i.size / total) * W * H })).sort((a, b) => b.area - a.area);
  const rects = [];
  let rem = [...scaled], x = 0, y = 0, w = W, h = H;
  function worst(row, side) {
    const rowArea = row.reduce((s, r) => s + r.area, 0), rowW = rowArea / side;
    let mx = 0;
    for (const r of row) { const rh = r.area / rowW; const asp = Math.max(rowW / rh, rh / rowW); if (asp > mx) mx = asp; }
    return mx;
  }
  while (rem.length > 0) {
    const vert = w < h;
    const side = vert ? w : h;
    let row = [rem[0]], rowArea = rem[0].area;
    for (let i = 1; i < rem.length; i++) {
      const nr = [...row, rem[i]], na = rowArea + rem[i].area;
      if (worst(nr, side) <= worst(row, side)) { row = nr; rowArea = na; } else break;
    }
    const rowSize = rowArea / side;
    let off = 0;
    for (const item of row) {
      const itemSize = item.area / rowSize;
      rects.push({ ...item, x: vert ? x + off : x, y: vert ? y : y + off, w: vert ? itemSize : rowSize, h: vert ? rowSize : itemSize });
      off += itemSize;
    }
    if (vert) { y += rowSize; h -= rowSize; } else { x += rowSize; w -= rowSize; }
    rem = rem.slice(row.length);
  }
  return rects;
}

function sharpeToColor(s) {
  if (s > 1.5) return "#0D5F2C"; if (s > 1) return "#1B6B3A"; if (s > 0.5) return "#3D8B5A";
  if (s > 0) return "#8BAA7A"; if (s > -0.5) return "#C4A05A"; if (s > -1) return "#C47A5A";
  return "#9B1B1B";
}

function HeatmapPanel({ indexName, universe }) {
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);
  const [progress, setProgress] = useState("");
  const [viewRef, inView] = useInView("300px 0px");
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 420 });

  useEffect(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDims({ w: r.width || 800, h: 420 });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const total = universe.length;
    let completed = 0;
    setProgress(`0/${total}`);
    const tasks = universe.map(async (s) => {
      try {
        const fd = await fetchStockData(s.ticker, "6mo");
        if (fd.data) {
          const analysis = runAnalysis(s.ticker, fd.data);
          const ret = analysis.data.length > 1 ? ((analysis.currentPrice - analysis.data[0].Close) / analysis.data[0].Close * 100) : 0;
          return { ...s, sharpe: analysis.risk.sharpe, vol: analysis.risk.volatility, ret, price: analysis.currentPrice, rec: analysis.recommendation.action };
        }
        return { ...s, sharpe: 0, vol: 0, ret: 0, price: 0, rec: "N/A" };
      } catch (e) {
        return { ...s, sharpe: 0, vol: 0, ret: 0, price: 0, rec: "N/A" };
      } finally {
        completed += 1;
        setProgress(`${completed}/${total} — ${s.ticker}`);
      }
    });
    const results = await Promise.all(tasks);
    setStocks(results);
    setLoading(false);
    setProgress("");
  }, [universe]);

  useEffect(() => {
    if (inView && !stocks && !loading) {
      load();
    }
  }, [inView, stocks, loading, load]);

  const sectors = useMemo(() => {
    if (!stocks) return [];
    const sectorMap = {};
    stocks.forEach(s => {
      if (!sectorMap[s.sector]) sectorMap[s.sector] = [];
      sectorMap[s.sector].push(s);
    });
    return Object.entries(sectorMap).sort((a, b) => {
      const capA = a[1].reduce((sum, s) => sum + s.cap, 0);
      const capB = b[1].reduce((sum, s) => sum + s.cap, 0);
      return capB - capA;
    });
  }, [stocks]);

  const rects = stocks ? squarify(stocks.map(s => ({ ...s, size: s.cap })), dims.w, dims.h) : [];

  return (
    <div ref={viewRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--display)", letterSpacing: "-0.01em" }}>{indexName}</div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 1 }}>{universe.length} stocks · Size: market cap · Color: Sharpe (6mo)</div>
        </div>
      </div>
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: 420, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
        {!stocks && !loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <button onClick={load} style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Load Heatmap
            </button>
            <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>Fetches {universe.length} stocks from Yahoo Finance</span>
          </div>
        )}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <BrandMark size={18} muted />
            <span style={{ fontFamily: "var(--display)", color: C.inkMuted, fontSize: 14 }}>Fetching {universe.length} stocks…</span>
            <span style={{ fontFamily: "var(--mono)", color: C.inkFaint, fontSize: 11 }}>{progress}</span>
          </div>
        )}
        {rects.map((r) => (
          <div key={r.ticker} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}
            style={{ position: "absolute", left: r.x, top: r.y, width: r.w - 1, height: r.h - 1, background: sharpeToColor(r.sharpe), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", border: `1px solid ${C.cream}33`, transition: "opacity 0.15s", opacity: hover && hover.ticker !== r.ticker ? 0.7 : 1 }}>
            {r.w > 40 && r.h > 25 && <span style={{ fontSize: Math.min(14, r.w / 5), fontWeight: 700, color: "#fff", fontFamily: "var(--mono)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{r.ticker}</span>}
            {r.w > 60 && r.h > 40 && <span style={{ fontSize: Math.min(10, r.w / 8), color: "#ffffffCC", fontFamily: "var(--mono)", marginTop: 2 }}>{r.ret > 0 ? "+" : ""}{fmt(r.ret, 1)}%</span>}
            {r.w > 80 && r.h > 55 && <span style={{ fontSize: 8, color: "#ffffff88", fontFamily: "var(--body)", marginTop: 1 }}>{r.sector}</span>}
          </div>
        ))}
        {hover && (
          <div style={{ position: "absolute", bottom: 8, left: 8, background: C.cream + "F0", border: `1px solid ${C.rule}`, padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.6, zIndex: 10, boxShadow: "2px 4px 12px rgba(0,0,0,0.06)" }}>
            <strong>{hover.ticker}</strong> — {hover.name}<br />
            <span style={{ color: C.inkMuted }}>Sector:</span> {hover.sector} · ${fmt(hover.price)} · Sharpe {fmt(hover.sharpe)} · {fmtPct(hover.ret)} 6mo · {hover.rec}
          </div>
        )}
        {stocks && (
          <button onClick={load} style={{ position: "absolute", top: 8, right: 8, padding: "4px 12px", background: C.cream + "E0", border: `1px solid ${C.rule}`, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted, cursor: "pointer", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Refresh
          </button>
        )}
      </div>
      {stocks && (
        <>
          <div style={{ display: "flex", gap: 10, fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>Sharpe:</span>
            {[[-1, "< -1"], [-0.5, "-0.5"], [0, "0"], [0.5, "0.5"], [1, "1"], [1.5, "> 1.5"]].map(([v, l]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 10, height: 10, background: sharpeToColor(v) }} />{l}
              </span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {sectors.map(([sectorName, sectorStocks]) => (
              <div key={sectorName} style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[sectorName] || C.inkMuted, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)" }}>{sectorName}</span>
                  <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)", marginLeft: "auto" }}>{sectorStocks.length}</span>
                </div>
                {sectorStocks.sort((a, b) => b.cap - a.cap).map(s => (
                  <div key={s.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: C.ink }}>{s.ticker}</span>
                      <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)" }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: s.ret >= 0 ? C.up : C.down }}>
                      {s.ret >= 0 ? "+" : ""}{fmt(s.ret, 1)}%
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HeatmapTab() {
  const indexNames = Object.keys(HEATMAP_INDEXES);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", marginBottom: 4 }}>Market Heatmaps</div>
        <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)" }}>Treemap visualizations by index, sized by market cap, colored by 6-month Sharpe ratio. Stocks sorted by sector.</div>
      </div>
      {indexNames.map(name => (
        <HeatmapPanel key={name} indexName={name} universe={HEATMAP_INDEXES[name]} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARISON TAB
// ═══════════════════════════════════════════════════════════
const COMP_LINE_COLORS = ["#1A1612", "#8B2500", "#5B4A8A", "#1B6B3A", "#D4A017", "#2E86AB", "#A23B72", "#C73E1D"];

function ComparisonTab() {
  const [tickers, setTickers] = useState("AAPL, MSFT, GOOGL, AMZN");
  const [results, setResults] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    const list = tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    const dataMap = {};
    const tasks = list.map(async (t) => {
      try {
        const fd = await fetchStockData(t, "6mo");
        if (fd.data) {
          const a = runAnalysis(t, fd.data);
          dataMap[t] = fd.data;
          return { ticker: t, price: a.currentPrice, rec: a.recommendation.action, conf: a.recommendation.confidence, regime: a.regime.overall, risk: a.risk.riskLevel, sharpe: a.risk.sharpe, vol: a.risk.volatility, maxDD: a.risk.maxDrawdown, mom: a.statSignals.momentum.avgMomentum, stretch: a.valuation.stretch };
        }
        return { ticker: t, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      } catch (e) {
        setError(prev => (prev || "") + `${t}: ${e.message || "failed"}; `);
        return { ticker: t, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      }
    });
    const res = await Promise.all(tasks);
    setResults(res);
    setRawData(dataMap);
    setLoading(false);
  };

  const sorted = useMemo(() => {
    if (!results || !sortCol) return results;
    return [...results].sort((a, b) => ((a[sortCol] > b[sortCol] ? 1 : -1) * sortDir));
  }, [results, sortCol, sortDir]);

  const overlayData = useMemo(() => {
    if (!rawData || !results) return null;
    const validTickers = results.filter(r => rawData[r.ticker] && rawData[r.ticker].length > 10).map(r => r.ticker);
    if (validTickers.length < 2) return null;
    const minLen = Math.min(...validTickers.map(t => rawData[t].length));
    const chartPoints = [];
    for (let i = 0; i < minLen; i++) {
      const point = { date: rawData[validTickers[0]][i].date.slice(5) };
      validTickers.forEach(t => {
        const base = rawData[t][0].Close;
        point[t] = base > 0 ? ((rawData[t][i].Close - base) / base) * 100 : 0;
      });
      chartPoints.push(point);
    }
    return { data: chartPoints, tickers: validTickers };
  }, [rawData, results]);

  const doSort = col => { if (sortCol === col) setSortDir(-sortDir); else { setSortCol(col); setSortDir(1); } };

  const thStyle = (col) => ({
    padding: "6px 8px", textAlign: "right", cursor: "pointer",
    color: sortCol === col ? C.ink : C.inkMuted, fontSize: 9, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--body)",
    borderBottom: `2px solid ${C.ink}`, userSelect: "none", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input value={tickers} onChange={e => setTickers(e.target.value)} placeholder="AAPL, MSFT, GOOGL..."
          style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 12px", color: C.ink, fontSize: 13, fontFamily: "var(--mono)", letterSpacing: "0.06em", outline: "none" }}
          onKeyDown={e => e.key === "Enter" && run()} />
        <button onClick={run} disabled={loading}
          style={{ padding: "8px 24px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
          {loading ? "Running…" : "Compare"}
        </button>
      </div>
      {error && <div style={{ padding: "6px 12px", background: C.downBg, color: C.down, fontSize: 11, fontFamily: "var(--mono)" }}>{error}</div>}
      {sorted && (
        <>
          {overlayData && (
            <Section title="Normalized Performance (6mo)">
              <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                {overlayData.tickers.map((t, i) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                    <span style={{ width: 12, height: 3, background: COMP_LINE_COLORS[i % COMP_LINE_COLORS.length] }} />
                    {t}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overlayData.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(overlayData.data.length / 10)} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <ReferenceLine y={0} stroke={C.rule} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                    formatter={(v, name) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`, name]} />
                  {overlayData.tickers.map((t, i) => (
                    <Line key={t} dataKey={t} stroke={COMP_LINE_COLORS[i % COMP_LINE_COLORS.length]} dot={false} strokeWidth={1.8} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle(null), textAlign: "left", cursor: "default" }}>Ticker</th>
                  <th style={thStyle("price")} onClick={() => doSort("price")}>Price{sortCol === "price" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("rec")} onClick={() => doSort("rec")}>Signal{sortCol === "rec" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("conf")} onClick={() => doSort("conf")}>Conf.{sortCol === "conf" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("sharpe")} onClick={() => doSort("sharpe")}>Sharpe{sortCol === "sharpe" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("vol")} onClick={() => doSort("vol")}>Vol.{sortCol === "vol" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("maxDD")} onClick={() => doSort("maxDD")}>Max DD{sortCol === "maxDD" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("mom")} onClick={() => doSort("mom")}>Mom.{sortCol === "mom" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("stretch")} onClick={() => doSort("stretch")}>Stretch{sortCol === "stretch" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.ticker} style={{ borderBottom: `1px solid ${C.ruleFaint}`, background: i % 2 ? C.warmWhite + "80" : "transparent" }}>
                    <td style={{ padding: "8px", fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 12 }}>{r.ticker}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(r.price)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}><span style={{ color: recColor(r.rec), fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)" }}>{r.rec}</span></td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.conf * 100, 0)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.sharpe > 1 ? C.up : r.sharpe > 0 ? C.hold : C.down }}>{fmt(r.sharpe)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.vol)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: C.down }}>{fmtPct(r.maxDD)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.mom > 0 ? C.up : C.down }}>{r.mom > 0 ? "+" : ""}{fmtPct(r.mom)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.stretch > 65 ? C.down : r.stretch < 35 ? C.up : C.hold }}>{fmt(r.stretch, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Section title="Sharpe Comparison">
                <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
                  <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} />
                    <YAxis dataKey="ticker" type="category" tick={{ fill: C.ink, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)" }} width={45} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                    <Bar dataKey="sharpe" name="Sharpe" fill={C.inkSoft} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title="Volatility Comparison">
                <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
                  <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="ticker" type="category" tick={{ fill: C.ink, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)" }} width={45} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} formatter={v => [`${fmt(v)}%`, "Volatility"]} />
                    <Bar dataKey="vol" name="Volatility" fill={C.accent + "AA"} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LITE TOOLS (Watchlist + Alerts dropdown)
// ═══════════════════════════════════════════════════════════
function LiteTools({ onAnalyze, watchlist = [], alerts = [], onAddWatchlist, onRemoveWatchlist, onAddAlert, onRemoveAlert }) {
  const [open, setOpen] = useState(false);
  const [subTab, setSubTab] = useState("watchlist");
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t || watchlist.some(w => w.ticker === t)) return;
    setBusy(true);
    try { await onAddWatchlist?.(t); } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    setBusy(true);
    const t = alForm.ticker.trim().toUpperCase(), v = parseFloat(alForm.value);
    try { await onAddAlert?.(t, alForm.type, v); } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "0 0 10px 0", background: "none", border: "none", borderBottom: open ? `2px solid ${C.ink}` : "2px solid transparent", color: open ? C.ink : C.inkMuted, fontSize: 12, fontWeight: open ? 700 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>
        Tools ▾ {(watchlist.length + alerts.length) > 0 && <span style={{ fontSize: 9, background: C.ink, color: C.cream, borderRadius: "50%", padding: "1px 5px", marginLeft: 4 }}>{watchlist.length + alerts.length}</span>}
      </button>
      {open && (
        <div className="menu-pop menu-pop-rightOrigin" style={{ position: "absolute", top: "100%", right: 0, width: 380, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.08)", zIndex: 2100, padding: 16, maxHeight: 480, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, marginBottom: 12, paddingBottom: 8 }}>
            {["watchlist", "alerts"].map(t => (
              <button key={t} onClick={() => setSubTab(t)} style={{ background: "none", border: "none", color: subTab === t ? C.ink : C.inkMuted, fontSize: 11, fontWeight: subTab === t ? 700 : 400, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)", borderBottom: subTab === t ? `2px solid ${C.ink}` : "none", paddingBottom: 4 }}>
                {t} ({t === "watchlist" ? watchlist.length : alerts.length})
              </button>
            ))}
          </div>
          {subTab === "watchlist" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder="Ticker"
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>ADD</button>
              </div>
              {watchlist.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>Empty watchlist</div> :
                watchlist.map(w => (
                  <div key={w.ticker} onClick={() => { onAnalyze(w.ticker); setOpen(false); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                      <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {w.spark && w.spark.length > 1 && (
                        <div style={{ opacity: 0.7 }}>
                          <Sparkline data={w.spark} color={w.change >= 0 ? C.up : C.down} prevClose={w.prevClose} width={80} height={28} />
                        </div>
                      )}
                      <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>{w.rec}</span>
                      <button onClick={e => { e.stopPropagation(); onRemoveWatchlist?.(w.ticker); }}
                        style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
          {subTab === "alerts" && (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder="Ticker"
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">Above</option><option value="below">Below</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>SET</button>
              </div>
              {alerts.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>No alerts</div> :
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? "TRIGGERED" : "WATCHING"}</span>
                      <button onClick={() => onRemoveAlert?.(a.id)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════════════════════
function AuthModal({ open, onClose }) {
  const [mode, setMode] = useState("signin");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNotice("");
    if (mode === "signin") setFirstName("");
  }, [open, mode]);

  if (!open) return null;

  const submitEmailAuth = async () => {
    if (!supabase) return;
    if (mode === "signup" && !firstName.trim()) { setError("First name required."); return; }
    if (!email || !password) { setError("Email and password required."); return; }
    setBusy(true); setError(""); setNotice("");
    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { first_name: firstName.trim() } },
      });
      if (err) setError(err.message);
      else setNotice("Check your email to confirm your account.");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
      else onClose();
    }
    setBusy(false);
  };

  const oauth = async (provider) => {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    const options = { redirectTo: window.location.origin };
    await supabase.auth.signInWithOAuth({ provider, options });
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,16,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
      <div style={{ width: "min(520px, 92vw)", background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 24, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.inkFaint }}>×</button>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {["signin", "signup"].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                fontWeight: mode === m ? 700 : 500,
                color: mode === m ? C.ink : C.inkMuted,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontFamily: "var(--body)",
                borderBottom: mode === m ? `2px solid ${C.ink}` : "2px solid transparent",
                paddingBottom: 6,
              }}
            >
              {m === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {!hasSupabaseConfig && (
          <div style={{ background: C.warmWhite, padding: 12, border: `1px dashed ${C.rule}`, fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
            Supabase config missing. Add your `VITE_SUPABASE_URL` and publishable key, then restart the dev server.
          </div>
        )}

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <button onClick={() => oauth("google")} disabled={busy || !hasSupabaseConfig} style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Continue with Google</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 12px" }}>
          <span style={{ flex: 1, height: 1, background: C.ruleFaint }} />
          <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>or</span>
          <span style={{ flex: 1, height: 1, background: C.ruleFaint }} />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {mode === "signup" && (
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name"
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
            style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password"
            style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          <button onClick={submitEmailAuth} disabled={busy || !hasSupabaseConfig} style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </div>

        {error && <div style={{ marginTop: 10, fontSize: 11, color: C.down, fontFamily: "var(--body)" }}>{error}</div>}
        {notice && <div style={{ marginTop: 10, fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>{notice}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PERF MONITOR
// ═══════════════════════════════════════════════════════════
function PerfMonitor({ onClose }) {
  const [metrics, setMetrics] = useState({});
  const fpsRef = useRef({ frames: 0, last: performance.now(), fps: 0 });

  useEffect(() => {
    let running = true;
    const updateFps = () => {
      if (!running) return;
      fpsRef.current.frames++;
      const now = performance.now();
      if (now - fpsRef.current.last >= 1000) {
        fpsRef.current.fps = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.last = now;
      }
      requestAnimationFrame(updateFps);
    };
    requestAnimationFrame(updateFps);

    const id = setInterval(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const heap = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : "N/A";
      setMetrics({
        pageLoad: nav ? `${Math.round(nav.loadEventEnd)}ms` : "N/A",
        jsHeap: heap,
        apiCalls: apiCallCount,
        lastLatency: `${lastApiLatency}ms`,
        domNodes: document.querySelectorAll("*").length,
        fps: fpsRef.current.fps,
      });
    }, 1000);

    return () => { running = false; clearInterval(id); };
  }, []);

  const row = { display: "flex", justifyContent: "space-between", padding: "3px 0" };
  const label = { color: "rgba(255,255,255,0.5)", fontSize: 10 };
  const val = { color: "#fff", fontSize: 10, fontWeight: 600 };

  return (
    <div style={{ position: "fixed", top: 12, right: 12, background: "rgba(26,22,18,0.92)", borderRadius: 8, padding: "12px 16px", fontFamily: "var(--mono)", zIndex: 9999, minWidth: 200, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#4ADE80", fontWeight: 700, letterSpacing: "0.08em" }}>PERF MONITOR</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={row}><span style={label}>Page Load</span><span style={val}>{metrics.pageLoad}</span></div>
      <div style={row}><span style={label}>JS Heap</span><span style={val}>{metrics.jsHeap}</span></div>
      <div style={row}><span style={label}>API Calls</span><span style={val}>{metrics.apiCalls}</span></div>
      <div style={row}><span style={label}>Last Latency</span><span style={val}>{metrics.lastLatency}</span></div>
      <div style={row}><span style={label}>DOM Nodes</span><span style={val}>{metrics.domNodes}</span></div>
      <div style={row}><span style={label}>FPS</span><span style={val}>{metrics.fps}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
function App() {
  const initialWorkspace = useMemo(() => loadLocalWorkspace(), []);
  const [tab, setTab] = useState("home");
  const [locale, setLocale] = useState(() => {
    if (typeof window === "undefined") return "en-US";
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved && TRANSLATIONS[saved] ? saved : "en-US";
  });
  const [isPro, setIsPro] = useState(false);
  const [session, setSession] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [syncState, setSyncState] = useState({ status: "idle", last: null, error: null });
  const [remoteHydrated, setRemoteHydrated] = useState(false);
  const workspaceRef = useRef(initialWorkspace);
  const userId = session?.user?.id || null;
  const profileName = useMemo(() => getFirstNameFromUser(session?.user), [session?.user]);
  const [watchlist, setWatchlist] = useState(initialWorkspace.watchlist);
  const [alerts, setAlerts] = useState(initialWorkspace.alerts);
  const [recentAnalyses, setRecentAnalyses] = useState(initialWorkspace.recent);
  const [savedComparisons, setSavedComparisons] = useState(initialWorkspace.comparisons);
  const [prefs, setPrefs] = useState(initialWorkspace.prefs);
  const [homeRegion, setHomeRegion] = useState(initialWorkspace.prefs?.region || "Global");
  const [ticker, setTicker] = useState("");
  const [period, setPeriod] = useState(initialWorkspace.prefs?.period || "1y");
  const [interval, setIntervalValue] = useState(initialWorkspace.prefs?.interval || "1d");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [chartLivePrice, setChartLivePrice] = useState(null);
  const [latency, setLatency] = useState(null);
  const [showPerf, setShowPerf] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchTimerRef = useRef(null);
  const searchRef = useRef(null);
  const accountMenuRef = useRef(null);
  const liveRef = useRef(null);
  const prevPriceRef = useRef(null);
  const chartTimerRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [helpMode, setHelpMode] = useState(false);
  const [helpTooltip, setHelpTooltip] = useState(null);
  const [chartIntent, setChartIntent] = useState(null);

  const t = useCallback((key) => {
    return (TRANSLATIONS[locale] && TRANSLATIONS[locale][key])
      || TRANSLATIONS["en-US"][key]
      || key;
  }, [locale]);

  const showHelp = useCallback((e, help) => {
    if (!helpMode || !help) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    const pad = 12;
    const viewportW = window.innerWidth || 0;
    const viewportH = window.innerHeight || 0;
    let x = rect.right + 12;
    if (x + tooltipWidth > viewportW - pad) {
      x = rect.left - tooltipWidth - 12;
    }
    if (x < pad) x = pad;
    let y = rect.top;
    const estimatedHeight = 140;
    if (y + estimatedHeight > viewportH - pad) {
      y = viewportH - estimatedHeight - pad;
    }
    if (y < pad) y = pad;
    setHelpTooltip({ title: help.title, body: help.body, x, y });
  }, [helpMode]);

  const hideHelp = useCallback(() => {
    if (helpMode) setHelpTooltip(null);
  }, [helpMode]);

  // Close search dropdown on outside click
  useEffect(() => {
    const h = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchDropdown(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = e => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (!helpMode) setHelpTooltip(null);
  }, [helpMode]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const results = await fetchSearch(searchQuery);
      setSearchResults(results);
      setShowSearchDropdown(true);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const workspaceData = useMemo(() => ({
    version: WORKSPACE_VERSION,
    watchlist,
    alerts,
    recent: recentAnalyses,
    comparisons: savedComparisons,
    prefs,
  }), [watchlist, alerts, recentAnalyses, savedComparisons, prefs]);

  useEffect(() => {
    workspaceRef.current = workspaceData;
  }, [workspaceData]);

  useEffect(() => {
    const id = setTimeout(() => saveLocalWorkspace(workspaceData), 200);
    return () => clearTimeout(id);
  }, [workspaceData]);

  useEffect(() => {
    setPrefs(prev => {
      if (prev.period === period && prev.interval === interval) return prev;
      return { ...prev, period, interval, updatedAt: Date.now() };
    });
  }, [period, interval]);

  useEffect(() => {
    setPrefs(prev => {
      if (prev.region === homeRegion) return prev;
      return { ...prev, region: homeRegion, updatedAt: Date.now() };
    });
  }, [homeRegion]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session || null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => { active = false; data?.subscription?.unsubscribe(); };
  }, []);

  const applyWorkspace = useCallback((ws) => {
    const safe = sanitizeWorkspace(ws);
    setWatchlist(safe.watchlist);
    setAlerts(safe.alerts);
    setRecentAnalyses(safe.recent);
    setSavedComparisons(safe.comparisons);
    setPrefs(safe.prefs);
    setHomeRegion(safe.prefs?.region || "Global");
    setPeriod(safe.prefs?.period || "1y");
    setIntervalValue(safe.prefs?.interval || "1d");
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      setRemoteHydrated(false);
      setSyncState({ status: "idle", last: null, error: null });
      return;
    }
    let cancelled = false;
    const loadRemote = async () => {
      setSyncState(s => ({ ...s, status: "syncing", error: null }));
      const { data, error: err } = await supabase
        .from("workspaces")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (err && err.code !== "PGRST116") {
        setSyncState({ status: "error", last: null, error: err.message });
        return;
      }
      const remoteData = data?.data ? sanitizeWorkspace(data.data) : null;
      const merged = mergeWorkspaces(workspaceRef.current, remoteData);
      applyWorkspace(merged);
      setRemoteHydrated(true);
      setSyncState({ status: "synced", last: Date.now(), error: null });
    };
    loadRemote();
    return () => { cancelled = true; };
  }, [userId, applyWorkspace]);

  useEffect(() => {
    if (!supabase || !userId || !remoteHydrated) return;
    const id = setTimeout(async () => {
      setSyncState(s => ({ ...s, status: "syncing", error: null }));
      const { error: err } = await supabase
        .from("workspaces")
        .upsert({
          user_id: userId,
          data: workspaceRef.current,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (err) {
        setSyncState({ status: "error", last: null, error: err.message });
      } else {
        setSyncState({ status: "synced", last: Date.now(), error: null });
      }
    }, 800);
    return () => clearTimeout(id);
  }, [workspaceData, userId, remoteHydrated]);

  const intervalOptions = useMemo(() => {
    if (["1d", "5d"].includes(period)) {
      return [["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["60m", "1h"]];
    }
    if (period === "1mo") {
      return [["15m", "15m"], ["30m", "30m"], ["60m", "1h"], ["1d", "1d"]];
    }
    return [["1d", "1d"]];
  }, [period]);

  useEffect(() => {
    if (!intervalOptions.some(([v]) => v === interval)) {
      setIntervalValue(intervalOptions[0][0]);
    }
  }, [intervalOptions, interval]);

  const addToWatchlist = useCallback(async (symbol) => {
    const t = (symbol || "").trim().toUpperCase();
    if (!t) return;
    if (watchlist.some(w => w.ticker === t)) return;
    const fd = await fetchStockData(t, "3mo");
    if (!fd?.data) return;
    const a = runAnalysis(t, fd.data);
    const closes = fd.data.map(d => d.Close).filter(v => v != null);
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : a.currentPrice;
    const entry = {
      ticker: t,
      price: a.currentPrice,
      change: prevClose ? ((a.currentPrice - prevClose) / prevClose) * 100 : 0,
      rec: a.recommendation.action,
      spark: closes.slice(-30),
      prevClose,
      addedAt: Date.now(),
    };
    setWatchlist(prev => (prev.some(w => w.ticker === t) ? prev : [...prev, entry]));
  }, [watchlist]);

  const removeFromWatchlist = useCallback((ticker) => {
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker));
  }, []);

  const addAlert = useCallback(async (symbol, type, value) => {
    const t = (symbol || "").trim().toUpperCase();
    const v = parseFloat(value);
    if (!t || Number.isNaN(v)) return;
    const fd = await fetchStockData(t, "1mo");
    const price = fd.data ? fd.data[fd.data.length - 1].Close : 0;
    setAlerts(prev => [...prev, { id: Date.now(), ticker: t, type, value: v, current: price, triggered: type === "above" ? price >= v : price <= v, createdAt: Date.now() }]);
  }, []);

  const removeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const recordRecent = useCallback((analysis) => {
    if (!analysis?.ticker) return;
    const closes = analysis.data?.map(d => d.Close).filter(v => v != null) || [];
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : analysis.currentPrice;
    const entry = {
      ticker: analysis.ticker,
      ts: Date.now(),
      price: analysis.currentPrice,
      action: analysis.recommendation?.action,
      confidence: analysis.recommendation?.confidence,
      regime: analysis.regime?.overall,
      riskLevel: analysis.risk?.riskLevel,
      period: analysis.period,
      interval: analysis.interval,
      source: analysis.source,
      spark: closes.slice(-30),
      prevClose,
    };
    setRecentAnalyses(prev => {
      const next = [entry, ...prev.filter(r => r.ticker !== entry.ticker)].slice(0, 20);
      return next;
    });
  }, []);

  useEffect(() => {
    const missing = watchlist.filter(w => !w.spark || w.spark.length < 2).map(w => w.ticker);
    if (!missing.length) return;
    let cancelled = false;
    Promise.allSettled(missing.map(t => fetchQuickQuote(t))).then(results => {
      if (cancelled) return;
      setWatchlist(prev => prev.map(w => {
        const idx = missing.indexOf(w.ticker);
        if (idx === -1) return w;
        const r = results[idx];
        if (r && r.status === "fulfilled") {
          return { ...w, spark: r.value.spark || w.spark, prevClose: r.value.prevClose ?? w.prevClose };
        }
        return w;
      }));
    });
    return () => { cancelled = true; };
  }, [watchlist]);

  // Live price polling every 15s
  useEffect(() => {
    if (!result) return;
    const poll = async () => {
      try {
        const s = performance.now();
        const fd = await fetchStockData(result.ticker, result.period || "1mo", result.interval || "1d");
        const lat = Math.round(performance.now() - s);
        setLatency(lat);
        if (fd.data) {
          const last = fd.data[fd.data.length - 1];
          prevPriceRef.current = livePrice || result.currentPrice;
          setLivePrice(last.Close);
        }
      } catch (e) { /* silent */ }
    };
    liveRef.current = setInterval(poll, 15000);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Micro-tick between polls for visual liveliness
  useEffect(() => {
    if (!result || !livePrice) return;
    const micro = setInterval(() => {
      setLivePrice(prev => {
        const jitter = (Math.random() - 0.5) * 0.001 * prev;
        prevPriceRef.current = prev;
        return +(prev + jitter).toFixed(2);
      });
    }, 1500);
    return () => clearInterval(micro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ticker, !!livePrice]);

  // Delay chart updates until animation finishes
  useEffect(() => {
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    if (livePrice == null) {
      setChartLivePrice(null);
      return;
    }
    chartTimerRef.current = setTimeout(() => {
      setChartLivePrice(livePrice);
    }, CHART_ANIM_MS);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [livePrice]);

  const analyze = useCallback(async (t) => {
    const sym = (t || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, period, interval);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = period;
      analysis.interval = interval;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setLatency(fd.latency);
      recordRecent(analysis);
      setTab("analysis");
    } catch (e) {
      setError({ message: e.message || "All data sources failed", debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [ticker, period, interval, recordRecent]);

  const reanalyze = useCallback(async (t, p, i) => {
    setPeriod(p);
    setIntervalValue(i);
    const sym = t.trim().toUpperCase();
    if (!sym) return;
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, p, i);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = p;
      analysis.interval = i;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setLatency(fd.latency);
      recordRecent(analysis);
    } catch (e) {
      setError({ message: e.message || "All data sources failed", debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [recordRecent]);

  const updateFirstName = useCallback(async (name) => {
    if (!supabase || !userId) return { error: "Not signed in." };
    const { data, error } = await supabase.auth.updateUser({ data: { first_name: name } });
    if (error) return { error: error.message };
    if (data?.user) {
      setSession(prev => (prev ? { ...prev, user: data.user } : prev));
    }
    return { error: null };
  }, [userId]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const tabStyle = (t, locked = false) => ({
    padding: "0 0 10px 0", marginRight: 24, background: "none", border: "none",
    borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: tab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 12,
    fontWeight: tab === t ? 700 : 500, cursor: "pointer",
    textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
  });
  const utilityTabStyle = (on) => ({
    padding: "0 0 10px 0",
    background: "none",
    border: "none",
    borderBottom: on ? `2px solid ${C.ink}` : "2px solid transparent",
    color: on ? C.ink : C.inkMuted,
    fontSize: 12,
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontFamily: "var(--body)",
  });
  const openCharts = useCallback((intent) => {
    setChartIntent(intent);
    setTab("charts");
  }, []);
  const consumeChartIntent = useCallback(() => setChartIntent(null), []);
  return (
    <div style={{ fontFamily: "var(--body)", background: C.cream, color: C.ink, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", maxWidth: "70%", margin: "0 auto", width: "100%" }}>
      <header style={{ padding: "16px 24px 0", borderBottom: `1px solid ${C.rule}`, position: "relative", zIndex: 2000 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <BrandMark size={22} pro={isPro} />
            <span style={{ width: 1, height: 14, background: C.rule, display: "inline-block", margin: "0 2px" }} />
            <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{t("tagline.quant")}</span>
          </div>
          <div ref={searchRef} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: "Search",
                body: "Type a ticker or company name. Press Enter or click Analyze to run the model.",
              }}
            >
              <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSearchDropdown(true); }} placeholder={t("search.placeholder")}
                style={{ width: 200, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", color: C.ink, fontSize: 12, fontFamily: "var(--body)", outline: "none" }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const sym = searchQuery.trim().toUpperCase();
                    if (sym) { analyze(sym); setSearchQuery(""); setShowSearchDropdown(false); }
                  }
                  if (e.key === "Escape") setShowSearchDropdown(false);
                }}
                onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
              />
            </HelpWrap>
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="menu-pop" style={{ position: "absolute", top: "100%", left: 0, width: 340, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 320, overflowY: "auto" }}>
                {searchResults.map((r) => (
                  <button key={r.symbol} onClick={() => { analyze(r.symbol); setSearchQuery(""); setShowSearchDropdown(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: C.ink }}>{r.symbol}</span>
                      <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginLeft: 8 }}>{r.shortname || r.longname || ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>
                      {r.exchDisp && <span>{r.exchDisp}</span>}
                      {r.typeDisp && <span style={{ background: C.paper, padding: "1px 4px" }}>{r.typeDisp}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: "Analyze",
                body: "Fetches fresh data and updates the recommendation, signals, and charts.",
              }}
            >
              <button onClick={() => { const sym = searchQuery.trim().toUpperCase(); if (sym) { analyze(sym); setSearchQuery(""); setShowSearchDropdown(false); } }} disabled={loading || !searchQuery.trim()}
                style={{ padding: "7px 20px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: loading ? "wait" : "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
                {loading ? t("search.running") : t("search.analyze")}
              </button>
            </HelpWrap>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {[
              { key: "home", label: t("nav.home") },
              { key: "analysis", label: t("nav.analysis") },
              { key: "charts", label: t("nav.charts") },
              { key: "heatmap", label: t("nav.heatmap"), pro: true },
              { key: "comparison", label: t("nav.comparison"), pro: true },
            ].map(({ key, label, pro, badge }) => {
              const locked = !!pro && !isPro;
              return (
                <button key={key} onClick={() => setTab(key)} style={tabStyle(key, locked)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span>{label}</span>
                    {locked && <ProTag small />}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            <button
              onClick={() => setHelpMode(m => !m)}
              style={utilityTabStyle(helpMode)}
              aria-pressed={helpMode}
            >
              {t("nav.help")}
            </button>
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: "Tools",
                body: "Open watchlist and alerts to manage tickers without leaving the page.",
              }}
            >
              <LiteTools
                onAnalyze={analyze}
                watchlist={watchlist}
                alerts={alerts}
                onAddWatchlist={addToWatchlist}
                onRemoveWatchlist={removeFromWatchlist}
                onAddAlert={addAlert}
                onRemoveAlert={removeAlert}
              />
            </HelpWrap>
            <div ref={accountMenuRef} style={{ position: "relative" }}>
              <HelpWrap
                enabled={helpMode}
                onShow={showHelp}
                onHide={hideHelp}
                help={{
                  title: "Account",
                  body: "Access settings, language, upgrades, and sign out.",
                }}
              >
                <button
                  onClick={() => setAccountMenuOpen(o => !o)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setAccountMenuOpen(false); setLangMenuOpen(false); }
                  }}
                  style={tabStyle("account")}
                >
                  {t("nav.account")}
                </button>
              </HelpWrap>
              {accountMenuOpen && (
                <div className="menu-pop menu-pop-rightOrigin" style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  width: 380,
                  background: C.cream,
                  color: C.ink,
                  borderRadius: 0,
                  border: `1px solid ${C.rule}`,
                  boxShadow: "4px 8px 24px rgba(0,0,0,0.08)",
                  padding: 16,
                  zIndex: 2200,
                }}>
                  <div style={{ padding: "6px 8px 10px", fontSize: 12, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                    {session?.user?.email || t("menu.signedOut")}
                  </div>
                  <div style={{ height: 1, background: C.rule, margin: "4px 8px 8px" }} />

                  <button
                    onClick={() => { setTab("account"); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <IconGear color={C.inkMuted} />
                    <span style={{ flex: 1, textAlign: "left" }}>{t("menu.settings")}</span>
                  </button>

                  <div
                    onMouseEnter={() => setLangMenuOpen(true)}
                    onMouseLeave={() => setLangMenuOpen(false)}
                    style={{ position: "relative" }}
                  >
                    <button
                      onClick={() => setLangMenuOpen(o => !o)}
                      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.paper}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <IconGlobe color={C.inkMuted} />
                      <span style={{ flex: 1, textAlign: "left" }}>{t("menu.language")}</span>
                      <IconChevronRight color={C.inkFaint} />
                    </button>
                    {langMenuOpen && (
                      <div
                        onMouseEnter={() => setLangMenuOpen(true)}
                        onMouseLeave={() => setLangMenuOpen(false)}
                        className="menu-pop-side"
                        style={{
                          position: "absolute",
                          left: "100%",
                          top: 0,
                          marginLeft: -1,
                          minWidth: 260,
                          background: C.cream,
                          borderRadius: 0,
                          border: `1px solid ${C.rule}`,
                          borderLeft: "none",
                          boxShadow: "4px 8px 24px rgba(0,0,0,0.08)",
                          padding: "8px 6px",
                          zIndex: 2300,
                        }}
                      >
                        {LANGUAGES.map((lang) => {
                          const active = lang.code === locale;
                          return (
                            <button
                              key={lang.code}
                              onClick={() => { setLocale(lang.code); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                width: "100%",
                                padding: "8px 12px",
                                background: active ? C.paper : "transparent",
                                border: "none",
                                color: C.ink,
                                cursor: "pointer",
                                fontSize: 13,
                                fontFamily: "var(--body)",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = C.paper}
                              onMouseLeave={e => e.currentTarget.style.background = active ? C.paper : "transparent"}
                            >
                              <span style={{ textAlign: "left" }}>{lang.label}</span>
                              {active && <IconCheck color={C.inkFaint} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                  <button
                    onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <IconCrown color={C.inkMuted} />
                    <span style={{ flex: 1, textAlign: "left" }}>{t("menu.upgrade")}</span>
                  </button>
                  <button
                    onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <IconGift color={C.inkMuted} />
                    <span style={{ flex: 1, textAlign: "left" }}>{t("menu.gift")}</span>
                  </button>

                  <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                  <button
                    onClick={() => { handleSignOut(); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <IconLogout color={C.inkMuted} />
                    <span style={{ flex: 1, textAlign: "left" }}>{t("menu.logout")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main style={{ flex: 1, padding: "20px 24px", overflowY: "auto", animation: "fadeIn 0.3s ease", position: "relative", zIndex: 1, minWidth: 0 }} key={tab + (result?.ticker || "")}>
        {loading && <LoadingScreen ticker={ticker} isPro={isPro} />}
        {!loading && error && <ErrorScreen error={error.message} debugInfo={error.debug} onRetry={() => analyze()} />}
        {!loading && !error && tab === "home" && <HomeTab onAnalyze={analyze} region={homeRegion} onRegionChange={setHomeRegion} greetingName={profileName} />}
        {!loading && !error && tab === "account" && (
          <AccountTab
            onAnalyze={analyze}
            watchlist={watchlist}
            alerts={alerts}
            recent={recentAnalyses}
            prefs={prefs}
            onAddWatchlist={addToWatchlist}
            onRemoveWatchlist={removeFromWatchlist}
            onAddAlert={addAlert}
            onRemoveAlert={removeAlert}
            onOpenAuth={() => setAuthOpen(true)}
            session={session}
            syncState={syncState}
            profileName={profileName}
            onUpdateName={updateFirstName}
            onSignOut={handleSignOut}
          />
        )}
        {!loading && !error && tab === "analysis" && (
          <AnalysisTab
            result={result}
            livePrice={livePrice}
            chartLivePrice={chartLivePrice}
            latency={latency}
            isPro={isPro}
            period={period}
            interval={interval}
            onReanalyze={reanalyze}
            onOpenCharts={openCharts}
            openChartsLabel={t("chart.openCharts")}
            helpMode={helpMode}
            onShowHelp={showHelp}
            onHideHelp={hideHelp}
          />
        )}
        {!loading && !error && tab === "charts" && <ChartsTab result={result} chartLivePrice={chartLivePrice} period={period} interval={interval} onReanalyze={reanalyze} intent={chartIntent} onConsumeIntent={consumeChartIntent} />}
        {!loading && !error && tab === "heatmap" && (isPro ? <HeatmapTab /> : (
          <ProGate
            title={t("pro.heatmap.title")}
            description={t("pro.heatmap.desc")}
            features={[t("pro.heatmap.f0"), t("pro.heatmap.f1"), t("pro.heatmap.f2")]}
          />
        ))}
        {!loading && !error && tab === "comparison" && (isPro ? <ComparisonTab /> : (
          <ProGate
            title={t("pro.comparison.title")}
            description={t("pro.comparison.desc")}
            features={[t("pro.comparison.f0"), t("pro.comparison.f1"), t("pro.comparison.f2")]}
          />
        ))}
      </main>

      <footer style={{ padding: "8px 24px", borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.04em", position: "relative", zIndex: 1, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoIcon size={12} color={C.inkFaint} />
          <span>{t("footer.disclaimer")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setIsPro(p => !p)} style={{ padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", cursor: "pointer" }}>
            DEV: {isPro ? "DISABLE" : "ENABLE"} PRO
          </button>
          <button onClick={() => setShowPerf(p => !p)} style={{ padding: "4px 10px", border: `1px solid ${C.rule}`, background: showPerf ? C.ink : "transparent", color: showPerf ? C.cream : C.inkMuted, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", cursor: "pointer" }}>
            DEV: PERF
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9 }}>v0.3.12</span>
        </div>
      </footer>

      {helpMode && (
        <div style={{ position: "fixed", right: 16, bottom: 16, width: 280, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.12)", padding: 12, zIndex: 5500 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>
            {t("help.title")}
          </div>
          <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5, marginBottom: 10 }}>
            {t("help.body")}
          </div>
          <button onClick={() => setHelpMode(false)} style={{ padding: "6px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {t("help.exit")}
          </button>
        </div>
      )}

      {helpMode && helpTooltip && (
        <div style={{ position: "fixed", left: helpTooltip.x, top: helpTooltip.y, width: 280, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 20px rgba(0,0,0,0.12)", padding: 12, zIndex: 6000, pointerEvents: "none" }}>
          {helpTooltip.title && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--body)", marginBottom: 6 }}>
              {helpTooltip.title}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5 }}>
            {helpTooltip.body}
          </div>
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      {showPerf && <PerfMonitor onClose={() => setShowPerf(false)} />}
    </div>
  );
}

export default App;
