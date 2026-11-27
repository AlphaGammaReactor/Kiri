// Figure guide content: a student's question → the recommended figure and test, why, and the alternatives.
// Each text is [English, 中文]. Plan v2 "Which figure?" table.

export type Pair = [string, string];
export type Alt = { figure: Pair; verdict: "ok" | "avoid"; why: Pair };
export type Recipe = {
  id: "tn" | "stage" | "survival" | "correlation" | "across" | "pathways" | "bench";
  question: Pair; figure: Pair; test: Pair; why: Pair; read: Pair; caution: Pair; alts: Alt[];
  action: "expression_tn" | "expression_stage" | "survival" | "correlation" | null;
  keywords: RegExp;
};

export const RECIPES: Recipe[] = [
  {
    id: "tn", action: "expression_tn",
    question: ["Is my gene higher (or lower) in tumour than in normal tissue?", "我的基因在肿瘤中是否高于（或低于）正常组织？"],
    figure: ["Box plot with every sample as a point", "箱线图，并把每个样本画成一个点"],
    test: ["Wilcoxon rank-sum test (Mann–Whitney U); signed-rank test for matched pairs", "Wilcoxon 秩和检验（Mann–Whitney U）；配对样本用符号秩检验"],
    why: ["Shows the whole spread and the sample size of each group, so a reader can see how much the groups overlap. Expression data are skewed and normal samples are few, so a rank test is safer than a t-test.",
      "能看到每组的全部分布和样本量，读者可以判断两组重叠多少。表达数据常偏态、正常样本少，所以秩检验比 t 检验更稳妥。"],
    read: ["Compare the medians (the line in each box) and how far the boxes overlap. Look at n under each group: TCGA has far fewer normal samples.",
      "比较中位数（箱中的线）和箱体的重叠程度。注意每组下方的 n：TCGA 的正常样本少得多。"],
    caution: ["Higher in tumour does not mean the gene drives the cancer. Normal tissue next to a tumour is not fully healthy tissue.",
      "在肿瘤中更高不代表该基因驱动癌症。癌旁正常组织也不完全是健康组织。"],
    alts: [
      { figure: ["Bar chart of means with error bars", "均值柱状图加误差线"], verdict: "avoid", why: ["Hides the spread and the number of samples; two very different distributions can give the same bars.", "隐藏了分布和样本数；两组差异很大的数据可以画出一样的柱子。"] },
      { figure: ["Violin plot", "小提琴图"], verdict: "ok", why: ["Fine with many samples per group; misleading shapes when a group has under about 30.", "每组样本多时可以；某组少于约 30 个样本时形状会误导。"] },
      { figure: ["t-test", "t 检验"], verdict: "avoid", why: ["Assumes roughly normal data with similar spread; often not true for expression, especially with few normals.", "假设数据近似正态且方差相近；表达数据常不满足，正常样本少时更是如此。"] },
    ],
    keywords: /tumou?r|normal|higher|lower|over-?express|under-?express|up-?regulat|down-?regulat|肿瘤|正常|高于|低于|上调|下调|高表达|低表达/i,
  },
  {
    id: "stage", action: "expression_stage",
    question: ["Does my gene change with tumour stage?", "我的基因是否随肿瘤分期变化？"],
    figure: ["Box plots by stage I–IV, every sample as a point", "按 I–IV 期分组的箱线图，每个样本一个点"],
    test: ["Kruskal–Wallis test, then pairwise rank-sum tests with Benjamini–Hochberg correction", "Kruskal–Wallis 检验，再做两两秩和检验并用 Benjamini–Hochberg 校正"],
    why: ["One test across all stages first avoids fishing for the one pair that happens to differ. The pairwise tests are corrected for being several.",
      "先对所有分期做一次整体检验，避免在多对比较中“钓”出偶然显著的一对。两两比较做了多重校正。"],
    read: ["A small overall p says at least one stage differs. Then look at which pairs, and whether the medians rise steadily or jump at one stage.",
      "整体 p 小说明至少有一期不同。再看是哪几对，以及中位数是逐期上升还是在某一期突变。"],
    caution: ["Stage IV groups are often small. Stage is recorded at diagnosis and some patients have it missing; Kiri leaves them out and says how many.",
      "IV 期组通常样本很少。分期在诊断时记录，部分患者缺失；Kiri 会剔除并说明数量。"],
    alts: [
      { figure: ["Line through the stage means", "连接各期均值的折线"], verdict: "avoid", why: ["Suggests a smooth trend between separate groups and hides the spread.", "暗示各期之间有连续趋势，并隐藏了分布。"] },
      { figure: ["Many separate t-tests", "多次单独的 t 检验"], verdict: "avoid", why: ["Six comparisons without correction will often find one p below 0.05 by chance.", "六次比较若不校正，常会偶然出现一个 p < 0.05。"] },
    ],
    keywords: /stage|grade|progress|分期|阶段|进展|分级/i,
  },
  {
    id: "survival", action: "survival",
    question: ["Is my gene linked to survival?", "我的基因是否与生存相关？"],
    figure: ["Kaplan–Meier curves for high and low expression, with the number at risk", "高表达与低表达两组的 Kaplan–Meier 曲线，附风险人数表"],
    test: ["Log-rank test; Cox model for the hazard ratio, optionally adjusted for age and stage", "Log-rank 检验；用 Cox 模型给出风险比，可校正年龄和分期"],
    why: ["Survival data have patients still alive at last follow-up (censored). Kaplan–Meier and Cox use everyone's follow-up time instead of throwing them out.",
      "生存数据中有随访结束时仍存活的患者（删失）。Kaplan–Meier 和 Cox 利用了每个人的随访时间，而不是把他们丢掉。"],
    read: ["Curves that separate early and stay apart suggest a real difference. Read the hazard ratio with its 95% interval: if the interval crosses 1, the data fit no difference.",
      "曲线早期分开并一直分开，提示存在真实差异。看风险比及其 95% 区间：若区间跨过 1，数据与“无差异”相容。"],
    caution: ["Split at the median unless you decided otherwise beforehand. Searching for the “best” cutpoint inflates false positives; Kiri corrects the p-value if you do.",
      "除非事先决定，否则按中位数分组。搜索“最佳”分割点会增加假阳性；如果你这样做，Kiri 会校正 p 值。"],
    alts: [
      { figure: ["Bar chart of 5-year survival rate", "5 年生存率柱状图"], verdict: "avoid", why: ["Ignores censored patients and everything that happens before and after year 5.", "忽略了删失患者以及第 5 年前后的全部信息。"] },
      { figure: ["Optimal cutpoint (as some web tools do)", "最佳分割点（一些网页工具的做法）"], verdict: "avoid", why: ["Tries many splits and keeps the smallest p; the raw p is far too optimistic.", "尝试多种分割并保留最小的 p；原始 p 值过于乐观。"] },
      { figure: ["Expression as a continuous Cox covariate", "把表达作为连续变量放入 Cox 模型"], verdict: "ok", why: ["Uses all the information; harder to draw, so pair it with the Kaplan–Meier figure.", "利用了全部信息；但难以作图，适合与 Kaplan–Meier 图一起报告。"] },
    ],
    keywords: /surviv|prognos|outcome|hazard|death|die|mortal|kaplan|cox|生存|预后|死亡|风险|结局/i,
  },
  {
    id: "correlation", action: "correlation",
    question: ["Do two genes go up and down together?", "两个基因是否同升同降？"],
    figure: ["Scatter plot, one point per patient, with a trend line", "散点图，每位患者一个点，附趋势线"],
    test: ["Spearman rank correlation (ρ), with Pearson shown for comparison", "Spearman 秩相关（ρ），并给出 Pearson 作对照"],
    why: ["The scatter shows whether the relationship is real across patients or driven by a few extreme points. Spearman works on ranks, so outliers matter less.",
      "散点图能看出这种关系是普遍存在，还是由少数极端点造成。Spearman 基于秩，受离群值影响较小。"],
    read: ["ρ near 0 means no monotonic relationship; above about 0.3 is a weak to moderate positive one. With hundreds of patients even tiny ρ values get small p-values, so read ρ, not just p.",
      "ρ 接近 0 表示没有单调关系；大于约 0.3 为弱到中等的正相关。患者数上百时，很小的 ρ 也会有很小的 p，所以要看 ρ，而不只是 p。"],
    caution: ["Correlation in tumour tissue can come from both genes following the same cell type (for example immune cells), not from one gene regulating the other.",
      "肿瘤组织中的相关可能只是两个基因都随同一种细胞（例如免疫细胞）变化，而不是一个基因调控另一个。"],
    alts: [
      { figure: ["Pearson correlation alone", "只用 Pearson 相关"], verdict: "ok", why: ["Fine for straight-line relationships without outliers; check the scatter first.", "关系为直线且无离群值时可以；先看散点图。"] },
      { figure: ["Heatmap of many genes", "多基因热图"], verdict: "ok", why: ["Good for an overview of many pairs; not for claiming one specific pair.", "适合多对基因的概览；不适合论证某一对特定关系。"] },
    ],
    keywords: /correlat|together|co-?express|relationship|two genes|vs\.? gene|associat\w* with \w+ gene|相关|共表达|一起|两个基因|关联/i,
  },
  {
    id: "across", action: null,
    question: ["Is my gene different across many cancer types?", "我的基因在不同癌种之间是否不同？"],
    figure: ["Paired box plots, tumour and normal side by side for each cancer", "每个癌种的肿瘤与正常并排箱线图"],
    test: ["Rank-sum test per cancer, corrected for the number of cancers (Benjamini–Hochberg)", "每个癌种做秩和检验，并按癌种数量校正（Benjamini–Hochberg）"],
    why: ["Shows the pattern at a glance while keeping each cancer's own normal tissue as its comparison.", "一眼看出整体规律，同时每个癌种都与自己的正常组织比较。"],
    read: ["Look for cancers where the boxes clearly separate and that have enough normal samples (n under the box).", "找箱体明显分开、且正常样本足够（看箱下方的 n）的癌种。"],
    caution: ["Several TCGA cancers have fewer than 10 normal samples; GTEx normals help but come from different donors and processing.", "部分 TCGA 癌种的正常样本不足 10 个；GTEx 正常样本有帮助，但来自不同供体和处理流程。"],
    alts: [{ figure: ["One bar per cancer", "每个癌种一根柱子"], verdict: "avoid", why: ["Loses the spread and the normal comparison.", "丢失了分布和正常组织对照。"] }],
    keywords: /across|pan-?cancer|cancers|many cancer|cancer types|泛癌|不同癌|多个癌|癌种之间/i,
  },
  {
    id: "pathways", action: null,
    question: ["Which pathways change with my gene?", "哪些通路随我的基因变化？"],
    figure: ["Enrichment dot plot, or a GSEA running-score plot for one pathway", "富集点图，或单条通路的 GSEA 运行得分图"],
    test: ["Differential expression (DESeq2 on counts), then GSEA on the ranked list", "差异表达（基于计数的 DESeq2），再对排序列表做 GSEA"],
    why: ["Ranks every gene instead of cutting at an arbitrary p-value, so weak but consistent changes still count.", "对所有基因排序而不是按任意 p 值截断，弱但一致的变化也能被发现。"],
    read: ["Look at the normalised enrichment score and the adjusted p (FDR); ignore pathways that only reach significance before correction.", "看标准化富集分数和校正后的 p（FDR）；忽略只在校正前显著的通路。"],
    caution: ["Gene-set versions change results; Kiri records which version was used.", "基因集版本会影响结果；Kiri 会记录所用版本。"],
    alts: [{ figure: ["Over-representation of a top-100 list", "取前 100 个基因做过表达分析"], verdict: "ok", why: ["Simple, but depends on where you cut the list.", "简单，但结果取决于在哪里截断。"] }],
    keywords: /pathway|enrich|gsea|kegg|go term|gene set|通路|富集|基因集/i,
  },
  {
    id: "bench", action: null,
    question: ["How do I plot my own qPCR or Western blot numbers?", "如何画我自己的 qPCR 或 Western 数据？"],
    figure: ["Dot plot of every replicate with the mean and its 95% interval", "画出每个重复的点图，并标出均值及 95% 区间"],
    test: ["Depends on the design: t-test or Mann–Whitney for two groups, ANOVA or Kruskal–Wallis for more; ΔΔCt for qPCR", "取决于设计：两组用 t 检验或 Mann–Whitney，多组用 ANOVA 或 Kruskal–Wallis；qPCR 用 ΔΔCt"],
    why: ["With three to six replicates every point matters; showing them is more honest than a bar.", "只有 3–6 个重复时每个点都重要；画出来比柱子更诚实。"],
    read: ["Say what n means: biological replicates, not wells or technical repeats.", "说明 n 指什么：生物学重复，而不是孔数或技术重复。"],
    caution: ["Technical replicates are not independent samples; average them first.", "技术重复不是独立样本；先取平均。"],
    alts: [{ figure: ["Bar with standard error", "柱状图加标准误"], verdict: "avoid", why: ["SE bars look small and hide that n is three.", "标准误线看起来很短，掩盖了 n 只有 3 的事实。"] }],
    keywords: /qpcr|pcr|western|blot|bench|my (own )?data|ct value|replicate|实验|定量|重复|印迹/i,
  },
];

export function matchRecipe(q: string): Recipe[] {
  const s = q.trim();
  if (!s) return [];
  return RECIPES.filter((r) => r.keywords.test(s));
}
