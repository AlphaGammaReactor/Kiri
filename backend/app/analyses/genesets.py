"""
Built-in gene sets: short marker lists for processes students often study
against a gene of interest. Each list is small on purpose (markers named in
reviews and primary papers), cited, and editable in the app; the person can
also type their own set.

Notes shown with each set say what its score can and cannot stand for. Two
flags drive Reliability checks:
* ``mixed``: the set holds genes that push the process in opposite directions,
  so an average of them is hard to read.
* ``stroma``: in bulk tumour RNA the genes mostly come from non-cancer cells.
"""

from __future__ import annotations

GENESETS: dict[str, dict] = {
    "uprmt_markers": {
        "name": "Mitochondrial UPR: markers", "zh": "线粒体未折叠蛋白反应（UPRmt）：标志基因",
        "genes": ["ATF5", "HSPD1", "HSPA9", "LONP1", "CLPP"],
        "about": "The transcription factor ATF5 and four matrix chaperones and proteases it induces (HSP60, mtHSP70, LONP1, ClpP), the usual read-outs of the mammalian mitochondrial unfolded protein response.",
        "about_zh": "转录因子 ATF5 及其诱导的四个基质分子伴侣和蛋白酶（HSP60、mtHSP70、LONP1、ClpP），是哺乳动物 UPRmt 最常用的读出指标。",
        "cite": ["Zhao Q et al. EMBO J 2002;21:4411", "Fiorese CJ et al. Curr Biol 2016;26:2037", "Shpilka T & Haynes CM. Nat Rev Mol Cell Biol 2018;19:109"],
    },
    "uprmt": {
        "name": "Mitochondrial UPR: extended", "zh": "线粒体未折叠蛋白反应（UPRmt）：扩展",
        "genes": ["ATF5", "HSPD1", "HSPE1", "HSPA9", "DNAJA3", "LONP1", "CLPP", "YME1L1", "TRAP1", "ATF4", "DDIT3", "SIRT3"],
        "about": "UPRmt markers plus HSP10, the co-chaperone DNAJA3, the protease YME1L1, TRAP1, the ATF4/CHOP arm shared with the integrated stress response, and SIRT3. ATF4 and CHOP also respond to other stresses, so this set is broader than the markers.",
        "about_zh": "在标志基因基础上加入 HSP10、辅分子伴侣 DNAJA3、蛋白酶 YME1L1、TRAP1、与整合应激反应共享的 ATF4/CHOP 分支以及 SIRT3。ATF4 与 CHOP 也响应其他应激，因此该集合比标志基因更宽泛。",
        "cite": ["Quirós PM et al. J Cell Biol 2017;216:2027", "Münch C & Harper JW. Nature 2016;534:710", "Papa L & Germain D. Mol Cell Biol 2014;34:699", "Aldridge JE et al. PLoS One 2007;2:e874"],
    },
    "mitophagy": {
        "name": "Mitophagy", "zh": "线粒体自噬",
        "genes": ["PINK1", "PRKN", "BNIP3", "BNIP3L", "FUNDC1", "PHB2", "FKBP8", "BCL2L13", "OPTN", "CALCOCO2", "SQSTM1", "MAP1LC3B"],
        "about": "PINK1–Parkin pathway, outer- and inner-membrane mitophagy receptors, and the autophagy adaptors that link them to LC3. Mitophagy is controlled mostly at the protein level, so mRNA is a weak proxy.",
        "about_zh": "PINK1–Parkin 通路、线粒体外膜和内膜自噬受体，以及将其与 LC3 连接的接头蛋白。线粒体自噬主要在蛋白水平调控，mRNA 只是较弱的替代指标。",
        "cite": ["Palikaras K et al. Nat Cell Biol 2018;20:1013", "Pickles S et al. Curr Biol 2018;28:R170"],
    },
    "isr": {
        "name": "Integrated stress response", "zh": "整合应激反应（ISR）",
        "genes": ["ATF4", "DDIT3", "PPP1R15A", "ATF3", "ASNS", "TRIB3", "CHAC1", "SESN2", "EIF2AK1", "EIF2AK2", "EIF2AK3", "EIF2AK4"],
        "about": "The four eIF2α kinases and the ATF4 targets induced when they fire (CHOP, GADD34, ATF3, ASNS, TRIB3, CHAC1, SESN2).",
        "about_zh": "四个 eIF2α 激酶，以及其激活后诱导的 ATF4 靶基因（CHOP、GADD34、ATF3、ASNS、TRIB3、CHAC1、SESN2）。",
        "cite": ["Pakos-Zebrucka K et al. EMBO Rep 2016;17:1374", "Costa-Mattioli M & Walter P. Science 2020;368:eaat5314"],
    },
    "er_stress": {
        "name": "ER stress (UPR)", "zh": "内质网应激（UPR）",
        "genes": ["HSPA5", "XBP1", "ATF6", "ERN1", "EIF2AK3", "DDIT3", "HERPUD1", "DNAJB9", "SEL1L", "EDEM1", "HYOU1", "PDIA4", "CALR"],
        "about": "The three ER stress sensors (IRE1, PERK, ATF6), BiP, XBP1 and their chaperone and ER-associated degradation targets.",
        "about_zh": "三个内质网应激感受器（IRE1、PERK、ATF6）、BiP、XBP1 及其分子伴侣和 ERAD 靶基因。",
        "cite": ["Walter P & Ron D. Science 2011;334:1081", "Hetz C. Nat Rev Mol Cell Biol 2012;13:89"],
    },
    "oxphos": {
        "name": "Oxidative phosphorylation", "zh": "氧化磷酸化（OXPHOS）",
        "genes": ["NDUFS1", "NDUFS2", "NDUFS3", "NDUFV1", "NDUFA9", "SDHA", "SDHB", "UQCRC1", "UQCRC2", "UQCRFS1", "COX4I1", "COX5A", "COX6C", "ATP5F1A", "ATP5F1B", "ATP5MC1"],
        "about": "Nuclear-encoded core subunits of complexes I to V. These track mitochondrial content closely, so a link with this score often means 'more mitochondria', not 'more respiration'.",
        "about_zh": "复合物 I 至 V 的核编码核心亚基。它们与线粒体含量高度相关，因此与该评分相关往往意味着“线粒体更多”，而不是“呼吸更强”。",
        "cite": ["Rath S et al. Nucleic Acids Res 2021;49:D1541 (MitoCarta3.0)"],
    },
    "mito_content": {
        "name": "Mitochondrial content (reference)", "zh": "线粒体含量（参照）",
        "genes": ["TOMM20", "TOMM40", "TIMM23", "VDAC1", "CS", "SDHA", "COX4I1", "ATP5F1A"],
        "about": "Abundant mitochondrial proteins used as a proxy for how many mitochondria a sample has. Kiri uses it as a check: does a link with a mitochondrial process survive once content is accounted for?",
        "about_zh": "常用作线粒体数量替代指标的高丰度线粒体蛋白。Kiri 用它做检查：在考虑线粒体含量后，与某个线粒体过程的关联是否仍然存在？",
        "cite": ["Larsen S et al. J Physiol 2012;590:3349", "Rath S et al. Nucleic Acids Res 2021;49:D1541"],
    },
    "mito_dynamics": {
        "name": "Mitochondrial fusion and fission", "zh": "线粒体融合与分裂",
        "genes": ["MFN1", "MFN2", "OPA1", "OMA1", "YME1L1", "DNM1L", "FIS1", "MFF", "MIEF1", "MIEF2"],
        "about": "Fusion (MFN1/2, OPA1 and its processing proteases OMA1, YME1L1) and fission (DRP1 and its receptors). Fusion and fission oppose each other, so look at the heatmap, not only the score.",
        "about_zh": "融合（MFN1/2、OPA1 及其加工蛋白酶 OMA1、YME1L1）与分裂（DRP1 及其受体）。两者作用相反，请结合热图解读，而不只看评分。",
        "cite": ["Giacomello M et al. Nat Rev Mol Cell Biol 2020;21:204"],
        "mixed": True,
    },
    "apoptosis": {
        "name": "Intrinsic apoptosis", "zh": "内源性凋亡",
        "genes": ["BAX", "BAK1", "BID", "BBC3", "PMAIP1", "BCL2", "BCL2L1", "MCL1", "CYCS", "APAF1", "DIABLO", "CASP9", "CASP3"],
        "about": "BCL-2 family members, cytochrome c and the apoptosome caspases. Pro- and anti-apoptotic genes are mixed, so the score is a measure of pathway expression, not of cell death.",
        "about_zh": "BCL-2 家族成员、细胞色素 c 与凋亡体 caspase。促凋亡与抗凋亡基因混合在一起，因此评分反映的是通路表达量，而不是细胞死亡。",
        "cite": ["Singh R et al. Nat Rev Mol Cell Biol 2019;20:175"],
        "mixed": True,
    },
    "ferroptosis": {
        "name": "Ferroptosis", "zh": "铁死亡",
        "genes": ["GPX4", "SLC7A11", "AIFM2", "NFE2L2", "FTH1", "ACSL4", "LPCAT3", "ALOX15", "TFRC", "NCOA4", "HMOX1"],
        "about": "Suppressors (GPX4, SLC7A11, FSP1/AIFM2, NRF2, ferritin) and drivers (ACSL4, LPCAT3, ALOX15, TFRC, NCOA4). Mixed directions: read the heatmap gene by gene.",
        "about_zh": "抑制因子（GPX4、SLC7A11、FSP1/AIFM2、NRF2、铁蛋白）与促进因子（ACSL4、LPCAT3、ALOX15、TFRC、NCOA4）。方向混合：请逐个基因阅读热图。",
        "cite": ["Dixon SJ et al. Cell 2012;149:1060", "Jiang X et al. Nat Rev Mol Cell Biol 2021;22:266"],
        "mixed": True,
    },
    "hypoxia": {
        "name": "Hypoxia", "zh": "缺氧",
        "genes": ["VEGFA", "SLC2A1", "PGK1", "LDHA", "ENO1", "CA9", "ADM", "NDRG1", "P4HA1", "BNIP3", "ANKRD37", "EGLN3"],
        "about": "HIF target genes, adapted from published tumour hypoxia signatures.",
        "about_zh": "HIF 靶基因，改编自已发表的肿瘤缺氧特征基因集。",
        "cite": ["Buffa FM et al. Br J Cancer 2010;102:428", "Semenza GL. Nat Rev Cancer 2003;3:721"],
    },
    "interferon": {
        "name": "Interferon response", "zh": "干扰素应答",
        "genes": ["ISG15", "IFI6", "IFI27", "IFIT1", "IFIT3", "MX1", "OAS1", "RSAD2", "STAT1", "IRF7"],
        "about": "Classic interferon-stimulated genes. In tumours they can come from cancer cells or from immune cells.",
        "about_zh": "经典干扰素刺激基因。在肿瘤中既可能来自癌细胞，也可能来自免疫细胞。",
        "cite": ["Schoggins JW et al. Nature 2011;472:481"],
    },
    "proliferation": {
        "name": "Proliferation", "zh": "增殖",
        "genes": ["MKI67", "TOP2A", "PCNA", "MCM2", "CCNB1", "CDK1", "CCNA2", "AURKA", "BUB1", "CENPF"],
        "about": "Cell-cycle genes. Many genes correlate with proliferation in tumours, so this is also a useful control.",
        "about_zh": "细胞周期基因。肿瘤中许多基因都与增殖相关，因此它也是有用的对照。",
        "cite": ["Venet D et al. PLoS Comput Biol 2011;7:e1002240", "Whitfield ML et al. Nat Rev Cancer 2006;6:99"],
    },
    "emt": {
        "name": "Epithelial–mesenchymal transition", "zh": "上皮–间质转化（EMT）",
        "genes": ["VIM", "CDH2", "FN1", "SNAI1", "SNAI2", "TWIST1", "ZEB1", "ZEB2", "MMP2", "COL1A1"],
        "about": "Mesenchymal markers and EMT transcription factors. In bulk tumour RNA these mostly come from fibroblasts and other stroma, not from cancer cells.",
        "about_zh": "间质标志物和 EMT 转录因子。在肿瘤整体 RNA 中，它们主要来自成纤维细胞等间质，而非癌细胞。",
        "cite": ["Yang J et al. Nat Rev Mol Cell Biol 2020;21:341"],
        "stroma": True,
    },
}

REFERENCE_SET = "mito_content"
MITO_SETS = {"uprmt_markers", "uprmt", "mitophagy", "oxphos", "mito_dynamics", "mito_content"}


def listing(language: str = "en") -> list[dict]:
    out = []
    for sid, s in GENESETS.items():
        out.append({"id": sid, "name": s["zh"] if language == "zh" else s["name"], "genes": s["genes"],
                    "about": s["about_zh"] if language == "zh" else s["about"], "cite": s["cite"],
                    "mixed": bool(s.get("mixed")), "stroma": bool(s.get("stroma")), "mito": sid in MITO_SETS})
    return out
