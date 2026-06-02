export type Language = "zh-CN" | "ja-JP" | "en-US";
export type ThemePreference = "system" | "light" | "dark";

type Dictionary = {
  appName: string;
  common: {
    noDescription: string;
    search: string;
    close: string;
    language: string;
    theme: string;
    reset: string;
    apply: string;
    unknown: string;
    explore: string;
  };
  toolbar: {
    projectLabel: string;
    projectCaption: string;
    home: string;
    searchPage: string;
    searchPlaceholder: string;
    advancedButton: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
  };
  landing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryAction: string;
    secondaryAction: string;
    methodsTitle: string;
    methodsBody: string;
    metricOneTitle: string;
    metricOneBody: string;
    metricTwoTitle: string;
    metricTwoBody: string;
    metricThreeTitle: string;
    metricThreeBody: string;
    metricFourTitle: string;
    metricFourBody: string;
    valueTitle: string;
    valueBody: string;
    qualityTitle: string;
    qualityBody: string;
    sampleTitle: string;
    sampleBody: string;
    viewAll: string;
  };
  workspace: {
    back: string;
    loading: string;
    loadingTitle: string;
    noResults: string;
    emptyTitle: string;
    emptyBody: string;
    errorTitle: string;
    retry: string;
    topFeed: string;
    hotFeed: string;
    risingFeed: string;
    searchResults: string;
    feedSwitcher: string;
    summaryTemplate: string;
    sourceLabel: string;
    queryLabel: string;
    noFilters: string;
    statusBadges: string;
    unknownError: string;
    queryTitle: string;
    queryBody: string;
    resultsLabel: string;
    analysisLabel: string;
    analysisBody: string;
    activeFiltersLabel: string;
    clearFilters: string;
    emptySearchTitle: string;
    emptySearchBody: string;
    promptTitle: string;
    promptOne: string;
    promptTwo: string;
    promptThree: string;
    browseTitle: string;
  };
  filters: {
    eyebrow: string;
    title: string;
    subtitle: string;
    textGroup: string;
    metadataGroup: string;
    scoreGroup: string;
    timeGroup: string;
    query: string;
    owner: string;
    packageName: string;
    keyword: string;
    description: string;
    license: string;
    repository: string;
    rank: string;
    momentum: string;
    minScore: string;
    maxScore: string;
    minDependents: string;
    minRecentDependents: string;
    minDownloads: string;
    fromYear: string;
    toYear: string;
    hasRepository: string;
    hasLicense: string;
    sort: string;
    order: string;
    orderAscending: string;
    orderDescending: string;
    any: string;
    yes: string;
    no: string;
    quickFilters: string;
    moreFilters: string;
  };
  detail: {
    title: string;
    loadingTitle: string;
    loading: string;
    idleTitle: string;
    idleBody: string;
    errorTitle: string;
    unknownError: string;
    packageMeta: string;
    latest: string;
    license: string;
    versions: string;
    repository: string;
    keywords: string;
    noKeywords: string;
    dependents: string;
    noDependents: string;
    score: string;
    scoreGrowth: string;
    dependentsMetric: string;
    downloads: string;
    recentDependents: string;
    released: string;
  };
};

export const dictionaries: Record<Language, Dictionary> = {
  "zh-CN": {
    appName: "Mooncake Impact Factor",
    common: {
      noDescription: "暂无描述",
      search: "搜索",
      close: "关闭",
      language: "语言",
      theme: "主题",
      reset: "重置",
      apply: "应用",
      unknown: "未知",
      explore: "查看"
    },
    toolbar: {
      projectLabel: "Mooncake Impact Factor",
      projectCaption: "MoonBit 包影响因子检索与分析",
      home: "首页",
      searchPage: "搜索",
      searchPlaceholder: "搜索包名、owner/name、关键词或研究问题",
      advancedButton: "高级筛选",
      themeSystem: "跟随系统",
      themeLight: "浅色",
      themeDark: "深色"
    },
    landing: {
      eyebrow: "Impact Metric for MoonBit",
      title: "用类似学术影响因子的方式，判断一个 MoonBit 包是否真正重要。",
      subtitle: "Mooncake Impact Factor 不是简单按热度排序，而是综合依赖扩散、近期增长、下载规模与发布时间，帮助你找出真正对生态产生影响的包。",
      primaryAction: "开始搜索",
      secondaryAction: "浏览 Top 包",
      methodsTitle: "评分信号",
      methodsBody: "我们把包的影响力拆成四种证据：被多少包依赖、最近增长是否持续、下载规模是否真实、最近是否还在活跃发布。",
      metricOneTitle: "依赖扩散",
      metricOneBody: "衡量一个包是否真正成为其他项目的基础设施。",
      metricTwoTitle: "近期增长",
      metricTwoBody: "识别哪些包在最近一段时间里正在快速上升。",
      metricThreeTitle: "下载规模",
      metricThreeBody: "过滤掉只在少数项目中出现、但没有真实采用面的包。",
      metricFourTitle: "发布时间",
      metricFourBody: "让长期停滞的包和近期活跃的包在评判上有所区分。",
      valueTitle: "它适合用来做什么",
      valueBody: "当你需要在大量 MoonBit 包中快速筛出值得读、值得依赖、值得跟踪的对象时，这个指标比普通关键词搜索更有判断力。",
      qualityTitle: "我们想回答的问题",
      qualityBody: "哪些包是真的在生态里起作用，而不是只看起来存在感很高。",
      sampleTitle: "样本包",
      sampleBody: "下面是当前数据库里具有代表性的高影响包样本。",
      viewAll: "进入搜索页"
    },
    workspace: {
      back: "返回首页",
      loading: "正在加载结果与分析面板。",
      loadingTitle: "正在加载",
      noResults: "没有找到符合当前条件的包。可以放宽筛选，或者改用示例查询重新开始。",
      emptyTitle: "没有结果",
      emptyBody: "输入一个问题，或者从下方示例中开始。",
      errorTitle: "加载失败",
      retry: "重试",
      topFeed: "Top",
      hotFeed: "Hot",
      risingFeed: "Rising",
      searchResults: "搜索结果",
      feedSwitcher: "结果来源",
      summaryTemplate: "共 {count} 条结果",
      sourceLabel: "来源",
      queryLabel: "查询",
      noFilters: "未附加筛选",
      statusBadges: "状态标签",
      unknownError: "加载结果时发生未知错误。",
      queryTitle: "收紧检索条件",
      queryBody: "保留核心筛选，把复杂条件放到高级筛选面板里。",
      resultsLabel: "结果列表",
      analysisLabel: "影响分析",
      analysisBody: "持续对比选中包的影响分、元信息与反向依赖证据。",
      activeFiltersLabel: "个筛选已启用",
      clearFilters: "清空筛选",
      emptySearchTitle: "从一个检索问题开始",
      emptySearchBody: "搜索包名、关键词、owner，或者直接用筛选定义你想找的高价值包。",
      promptTitle: "示例查询",
      promptOne: "哪些包依赖面广，但还没有被过度关注？",
      promptTwo: "最近 30 天增长最快的 MoonBit 包有哪些？",
      promptThree: "哪些高分包已有仓库，适合优先阅读？",
      browseTitle: "直接浏览"
    },
    filters: {
      eyebrow: "Advanced Search",
      title: "高级筛选",
      subtitle: "保留完整能力，但默认只展示最重要的筛选项。",
      textGroup: "文本条件",
      metadataGroup: "元信息",
      scoreGroup: "评分与规模",
      timeGroup: "时间与排序",
      query: "全文查询",
      owner: "Owner",
      packageName: "包名",
      keyword: "关键词",
      description: "描述",
      license: "许可证",
      repository: "仓库",
      rank: "等级",
      momentum: "状态",
      minScore: "最低分数",
      maxScore: "最高分数",
      minDependents: "最少依赖数",
      minRecentDependents: "最少近期依赖",
      minDownloads: "最少下载量",
      fromYear: "起始年份",
      toYear: "结束年份",
      hasRepository: "有仓库链接",
      hasLicense: "有许可证信息",
      sort: "排序字段",
      order: "排序方向",
      orderAscending: "升序",
      orderDescending: "降序",
      any: "不限",
      yes: "是",
      no: "否",
      quickFilters: "核心筛选",
      moreFilters: "更多条件"
    },
    detail: {
      title: "包影响分析",
      loadingTitle: "正在加载分析",
      loading: "正在拉取包信息与反向依赖。",
      idleTitle: "选择一个包开始分析",
      idleBody: "结果列表中的包会在右侧展示更完整的影响证据。",
      errorTitle: "分析加载失败",
      unknownError: "加载详情时发生未知错误。",
      packageMeta: "包信息",
      latest: "最新版本",
      license: "许可证",
      versions: "版本数",
      repository: "打开仓库",
      keywords: "关键词",
      noKeywords: "暂无关键词",
      dependents: "反向依赖",
      noDependents: "当前没有反向依赖数据。",
      score: "影响分",
      scoreGrowth: "30 天增长",
      dependentsMetric: "依赖数",
      downloads: "下载量",
      recentDependents: "近期依赖",
      released: "最近发布时间"
    }
  },
  "ja-JP": {
    appName: "Mooncake Impact Factor",
    common: {
      noDescription: "説明がありません",
      search: "検索",
      close: "閉じる",
      language: "言語",
      theme: "テーマ",
      reset: "リセット",
      apply: "適用",
      unknown: "不明",
      explore: "見る"
    },
    toolbar: {
      projectLabel: "Mooncake Impact Factor",
      projectCaption: "MoonBit パッケージ影響因子の検索と分析",
      home: "ホーム",
      searchPage: "検索",
      searchPlaceholder: "パッケージ名、owner/name、キーワード、問いで検索",
      advancedButton: "詳細フィルター",
      themeSystem: "システム設定",
      themeLight: "ライト",
      themeDark: "ダーク"
    },
    landing: {
      eyebrow: "Impact Metric for MoonBit",
      title: "学術的な影響因子に近い考え方で、MoonBit パッケージの本当の重要度を見極める。",
      subtitle: "Mooncake Impact Factor は単なる人気順ではありません。依存の広がり、最近の成長、ダウンロード規模、公開時期を合わせて、実際に価値のあるパッケージを見つけるための指標です。",
      primaryAction: "検索を始める",
      secondaryAction: "Top を見る",
      methodsTitle: "評価に使うシグナル",
      methodsBody: "影響力を四つの証拠に分けて見ます。どれだけ依存されているか、最近伸びているか、実際に使われているか、今も更新されているかです。",
      metricOneTitle: "依存の広がり",
      metricOneBody: "他のパッケージにどれだけ基盤として使われているかを見ます。",
      metricTwoTitle: "最近の成長",
      metricTwoBody: "直近で存在感を強めているパッケージを見つけます。",
      metricThreeTitle: "ダウンロード規模",
      metricThreeBody: "一部にしか使われていないものを過大評価しないためです。",
      metricFourTitle: "公開時期",
      metricFourBody: "長く停滞しているものと、今も活発なものを区別します。",
      valueTitle: "何に使えるか",
      valueBody: "たくさんの MoonBit パッケージから、読む価値・依存する価値・追跡する価値のあるものを早く絞り込めます。",
      qualityTitle: "答えたい問い",
      qualityBody: "本当にエコシステムに影響を与えているパッケージはどれか。",
      sampleTitle: "代表サンプル",
      sampleBody: "現在のデータベースから、影響度の高い代表的なパッケージをいくつか示します。",
      viewAll: "検索ページへ"
    },
    workspace: {
      back: "ホームへ戻る",
      loading: "結果と分析パネルを読み込んでいます。",
      loadingTitle: "読み込み中",
      noResults: "条件に一致するパッケージがありません。条件を緩めるか、別の例から始めてください。",
      emptyTitle: "結果がありません",
      emptyBody: "問いを入力するか、下の例から始めてください。",
      errorTitle: "読み込みに失敗しました",
      retry: "再試行",
      topFeed: "Top",
      hotFeed: "Hot",
      risingFeed: "Rising",
      searchResults: "検索結果",
      feedSwitcher: "結果ソース",
      summaryTemplate: "{count} 件の結果",
      sourceLabel: "ソース",
      queryLabel: "クエリ",
      noFilters: "追加フィルターなし",
      statusBadges: "状態ラベル",
      unknownError: "結果の読み込み中に不明なエラーが発生しました。",
      queryTitle: "検索条件を絞り込む",
      queryBody: "重要なフィルターだけを前面に置き、残りは詳細フィルターにまとめます。",
      resultsLabel: "結果一覧",
      analysisLabel: "影響分析",
      analysisBody: "スコア、メタ情報、依存元を継続的に比較します。",
      activeFiltersLabel: "個のフィルターを使用中",
      clearFilters: "フィルターをクリア",
      emptySearchTitle: "問いから検索を始める",
      emptySearchBody: "パッケージ名、キーワード、owner を検索するか、条件で高価値パッケージを定義してください。",
      promptTitle: "クエリ例",
      promptOne: "依存の広がりは強いが、まだ過熱していないパッケージは？",
      promptTwo: "最近 30 日で最も伸びている MoonBit パッケージは？",
      promptThree: "高スコアでリポジトリがあるパッケージはどれ？",
      browseTitle: "そのまま閲覧"
    },
    filters: {
      eyebrow: "Advanced Search",
      title: "詳細フィルター",
      subtitle: "完全な絞り込み能力は残しつつ、初期画面は重要項目だけを見せます。",
      textGroup: "テキスト条件",
      metadataGroup: "メタデータ",
      scoreGroup: "スコアと規模",
      timeGroup: "時間と並び替え",
      query: "全文検索",
      owner: "Owner",
      packageName: "パッケージ名",
      keyword: "キーワード",
      description: "説明",
      license: "ライセンス",
      repository: "リポジトリ",
      rank: "ランク",
      momentum: "状態",
      minScore: "最小スコア",
      maxScore: "最大スコア",
      minDependents: "最小依存数",
      minRecentDependents: "最近依存の最小値",
      minDownloads: "最小ダウンロード数",
      fromYear: "開始年",
      toYear: "終了年",
      hasRepository: "リポジトリあり",
      hasLicense: "ライセンスあり",
      sort: "並び替え項目",
      order: "並び順",
      orderAscending: "昇順",
      orderDescending: "降順",
      any: "指定なし",
      yes: "はい",
      no: "いいえ",
      quickFilters: "主要フィルター",
      moreFilters: "その他の条件"
    },
    detail: {
      title: "パッケージ影響分析",
      loadingTitle: "分析を読み込み中",
      loading: "パッケージ情報と依存元を取得しています。",
      idleTitle: "分析するパッケージを選択してください",
      idleBody: "結果一覧から選ぶと、右側に影響の根拠が表示されます。",
      errorTitle: "分析の読み込みに失敗しました",
      unknownError: "詳細の読み込み中に不明なエラーが発生しました。",
      packageMeta: "パッケージ情報",
      latest: "最新バージョン",
      license: "ライセンス",
      versions: "バージョン数",
      repository: "リポジトリを開く",
      keywords: "キーワード",
      noKeywords: "キーワードなし",
      dependents: "依存元",
      noDependents: "依存元データはありません。",
      score: "影響スコア",
      scoreGrowth: "30日成長",
      dependentsMetric: "依存数",
      downloads: "ダウンロード数",
      recentDependents: "最近の依存",
      released: "最新公開日"
    }
  },
  "en-US": {
    appName: "Mooncake Impact Factor",
    common: {
      noDescription: "No description available",
      search: "Search",
      close: "Close",
      language: "Language",
      theme: "Theme",
      reset: "Reset",
      apply: "Apply",
      unknown: "Unknown",
      explore: "Explore"
    },
    toolbar: {
      projectLabel: "Mooncake Impact Factor",
      projectCaption: "Search and analyze MoonBit package influence",
      home: "Home",
      searchPage: "Search",
      searchPlaceholder: "Search by package, owner/name, keyword, or research question",
      advancedButton: "Advanced filters",
      themeSystem: "System",
      themeLight: "Light",
      themeDark: "Dark"
    },
    landing: {
      eyebrow: "Impact Metric for MoonBit",
      title: "Evaluate a MoonBit package the way an academic field evaluates influence.",
      subtitle: "Mooncake Impact Factor ranks packages by more than attention. It combines dependency reach, recent growth, download scale, and release recency to surface packages with real ecosystem value.",
      primaryAction: "Start searching",
      secondaryAction: "Browse Top packages",
      methodsTitle: "Scoring signals",
      methodsBody: "Influence is broken into four kinds of evidence: how widely a package is depended on, whether it is still growing, whether it has real adoption, and whether it remains active.",
      metricOneTitle: "Dependency reach",
      metricOneBody: "Shows whether a package has become infrastructure for other projects.",
      metricTwoTitle: "Recent growth",
      metricTwoBody: "Highlights packages gaining momentum over the last window.",
      metricThreeTitle: "Download scale",
      metricThreeBody: "Helps filter out packages with narrow visibility but limited actual use.",
      metricFourTitle: "Release timing",
      metricFourBody: "Separates actively maintained packages from long-stagnant ones.",
      valueTitle: "What it helps you do",
      valueBody: "Use it to narrow a large MoonBit ecosystem into packages worth reading, depending on, or tracking.",
      qualityTitle: "The question behind it",
      qualityBody: "Which packages are actually shaping the ecosystem, not just appearing in search results.",
      sampleTitle: "Representative samples",
      sampleBody: "A few current packages with strong impact signals across the index.",
      viewAll: "Open search"
    },
    workspace: {
      back: "Back to home",
      loading: "Loading results and assembling the analysis panel.",
      loadingTitle: "Loading",
      noResults: "No packages match the current criteria. Relax the filters or start again from an example query.",
      emptyTitle: "No results",
      emptyBody: "Type a question or start from one of the examples below.",
      errorTitle: "Could not load results",
      retry: "Retry",
      topFeed: "Top",
      hotFeed: "Hot",
      risingFeed: "Rising",
      searchResults: "Search Results",
      feedSwitcher: "Result source",
      summaryTemplate: "{count} results",
      sourceLabel: "Source",
      queryLabel: "Query",
      noFilters: "No filters applied",
      statusBadges: "Status badges",
      unknownError: "An unknown error occurred while loading results.",
      queryTitle: "Refine the search",
      queryBody: "Keep only the core filters on the surface and move the rest into an advanced panel.",
      resultsLabel: "Result list",
      analysisLabel: "Impact analysis",
      analysisBody: "Keep score, metadata, and reverse-dependency evidence visible while comparing packages.",
      activeFiltersLabel: "filters active",
      clearFilters: "Clear filters",
      emptySearchTitle: "Start from a search question",
      emptySearchBody: "Search by package, keyword, or owner, or define the kind of high-value package you want to find.",
      promptTitle: "Example queries",
      promptOne: "Which packages have broad dependency reach but are not yet overexposed?",
      promptTwo: "Which MoonBit packages are rising fastest over the last 30 days?",
      promptThree: "Which high-score packages with repositories deserve a closer look first?",
      browseTitle: "Browse directly"
    },
    filters: {
      eyebrow: "Advanced Search",
      title: "Advanced filters",
      subtitle: "Keep the full search surface, but show only the highest-value controls by default.",
      textGroup: "Text filters",
      metadataGroup: "Metadata",
      scoreGroup: "Score and scale",
      timeGroup: "Time and sorting",
      query: "Full-text query",
      owner: "Owner",
      packageName: "Package name",
      keyword: "Keyword",
      description: "Description",
      license: "License",
      repository: "Repository",
      rank: "Rank",
      momentum: "Status",
      minScore: "Minimum score",
      maxScore: "Maximum score",
      minDependents: "Minimum dependents",
      minRecentDependents: "Minimum recent dependents",
      minDownloads: "Minimum downloads",
      fromYear: "From year",
      toYear: "To year",
      hasRepository: "Has repository",
      hasLicense: "Has license",
      sort: "Sort field",
      order: "Sort order",
      orderAscending: "Ascending",
      orderDescending: "Descending",
      any: "Any",
      yes: "Yes",
      no: "No",
      quickFilters: "Core filters",
      moreFilters: "More filters"
    },
    detail: {
      title: "Package impact analysis",
      loadingTitle: "Loading analysis",
      loading: "Fetching package metadata and reverse dependencies.",
      idleTitle: "Select a package to analyze",
      idleBody: "The selected package will open on the right with score evidence and metadata.",
      errorTitle: "Could not load analysis",
      unknownError: "An unknown error occurred while loading package detail.",
      packageMeta: "Package metadata",
      latest: "Latest version",
      license: "License",
      versions: "Versions",
      repository: "Open repository",
      keywords: "Keywords",
      noKeywords: "No keywords listed",
      dependents: "Dependents",
      noDependents: "No dependents available.",
      score: "Impact score",
      scoreGrowth: "30d growth",
      dependentsMetric: "Dependents",
      downloads: "Downloads",
      recentDependents: "Recent dependents",
      released: "Latest release date"
    }
  }
};

export function detectLanguage(): Language {
  if (typeof navigator === "undefined") {
    return "zh-CN";
  }

  const browserLanguages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const language of browserLanguages) {
    if (language.startsWith("zh")) return "zh-CN";
    if (language.startsWith("ja")) return "ja-JP";
    if (language.startsWith("en")) return "en-US";
  }

  return "zh-CN";
}
