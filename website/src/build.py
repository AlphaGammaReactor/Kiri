"""Build the Kiri website (English and 中文) from one template set.

    python website/src/build.py

Writes static pages to website/public/. The pages are plain HTML and CSS with
one small script (site.js) that asks /api/release whether a Mac build exists.
Copy follows Figma page 21 ("21 · Website"), adapted for Mac-only downloads.
"""

import shutil
from pathlib import Path

SRC = Path(__file__).parent
OUT = SRC.parent / "public"
RELEASES = "https://github.com/AlphaGammaReactor/Kiri/releases"

ICONS = {
    "download": '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    "check": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    "shield": '<path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    "offline": '<path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8a15 15 0 0 0-11-3.6"/><path d="M5 12.6a10 10 0 0 1 3.3-2"/><path d="M19 12.6a10 10 0 0 0-3-1.8"/><path d="M8.5 16.3a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    "image": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    "book": '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M8 7h7"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    "alert": '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    "laptop": '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "leaf": '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 14 10"/>',
}


def icon(name: str) -> str:
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


T = {
    "en": {
        "html_lang": "en",
        "prefix": "",
        "title": "Kiri · Statistics and figures for your thesis",
        "banner": "Preview site for invited testers. Please don’t share the link or the password.",
        "signout": "Sign out",
        "nav": ["Download", "Kiri Plus", "Install guide", "FAQ"],
        "nav_btn": "Download",
        "eyebrow": "Free for students · Mac beta",
        "h1": "Statistics and figures for your thesis, on your own laptop.",
        "sub": "Kiri runs survival, expression and enrichment analyses on public cancer data and on your own tables, explains each result in plain words, and exports figures journals accept. No account and no internet needed, in English and 中文.",
        "btn_mac": "Download for Mac (beta)",
        "btn_guide": "How to install",
        "btn_soon": "Mac beta coming soon",
        "hero_meta": "macOS 12 Monterey or later · Apple silicon or Intel · 8 GB memory",
        "hero_meta_ver": "Beta {v} · macOS 12 or later · 8 GB memory",
        "trust": ["No account", "Nothing leaves your computer", "Works offline"],
        "bubble": "“Hi, I’m Kiri. I made this for students like you.”",
        "pv_crumbs": "PARL–MAVS in CRC  /  Analysis  /  Survival",
        "pv_title": "Overall survival by PARL expression",
        "pv_side": ["Home", "Projects", "Survival", "Expression", "Enrichment", "Notebook", "Learn"],
        "pv_cap": "PARL high (n = 219) vs low (n = 219). Shaded bands are 95% confidence intervals.",
        "pv_ok": "Figure check passed",
        "pv_tabs": ["Explain", "Reliability"],
        "pv_explain": "Patients with high PARL lived longer on average, and the difference is unlikely to be chance (log-rank p = 0.004).",
        "pv_note": "This is an association, not proof of cause.",
        "pv_by": "Written from the numbers, not by AI",
        "pv_caption": "The app design. The beta may look slightly different.",
        "f_eyebrow": "Why students use Kiri",
        "f_h2": "Built for the way students actually work",
        "features": [
            ("shield", "Honest results", "Every result has a Reliability check that tells you when the data is too thin to trust, before your supervisor does."),
            ("image", "Figures journals accept", "Export SVG, PDF or 300 dpi PNG at 89 or 183 mm, with text that stays editable in Word and Illustrator."),
            ("book", "Learn as you go", "Plain-language explanations, a glossary, and a card for every term that says what it means and how to read it."),
            ("globe", "English, 中文 or both", "Switch the whole app, or show both languages at once while you learn the terms."),
        ],
        "h_eyebrow": "How it works",
        "h_h2": "From download to figure in ten minutes",
        "steps": [
            ("Install", "Open the download and drag Kiri to Applications. It takes about two minutes and needs no account."),
            ("Open the sample", "Explore TP53, or PARL–MAVS in colorectal cancer, with every step explained."),
            ("Export to Word", "Pick a journal size, let the figure check run, and paste the figure into your thesis."),
        ],
        "p_h3": "Your data stays on your computer",
        "p_text": "Kiri goes online only to fetch the public datasets you ask for and to check for updates. Your own files are never uploaded, and there is no tracking.",
        "d_eyebrow": "Download",
        "d_h2": "Download Kiri",
        "d_lead": "Free for every analysis. Kiri comes to Mac first. The beta isn’t notarised by Apple yet, so your Mac will ask you to confirm the first time you open it.",
        "d_mac_badge": "Beta",
        "d_mac_file_none": "Not published yet",
        "d_mac_checks": ["macOS 12 Monterey or later", "Apple silicon (M1 or newer). Intel build when available", "8 GB memory"],
        "d_intel": "Download for Intel Macs",
        "d_mac_note": "If macOS says Kiri can’t be opened, go to System Settings › Privacy & Security and click Open Anyway.",
        "d_soon_note": "The first Mac beta is being built now. This button turns on by itself as soon as it is published.",
        "d_win": "Windows",
        "d_win_badge": "Later",
        "d_win_text": "A Windows version is planned after the Mac beta. It isn’t available yet.",
        "d_links": [("Install guide with pictures", "install-mac.html"), ("Release notes", RELEASES)],
        "t_h3": "Every analysis is free, for good.",
        "t_text": "Kiri Plus will be an optional one-time purchase for extras like batch export and journal style packs. US$9 for students, and it helps keep Kiri free.",
        "t_btn": "See what’s in Plus",
        "q_eyebrow": "Questions",
        "q_h2": "Before you download",
        "faq": [
            ("Is Kiri really free?", "Yes. Every analysis, dataset, figure export and language mode is free. Kiri Plus only adds conveniences."),
            ("Do I need an account?", "No. Kiri has no accounts. Download it, open it, and start."),
            ("Can I use it for my thesis or a paper?", "Yes. Each result names the method and the software package behind it, so you can cite it, and figures export at journal column widths. Check your department’s rules as well."),
            ("Why does my Mac warn me during install?", "The beta isn’t notarised by Apple yet, so macOS stops the first launch. That’s expected. The install guide shows the two clicks that open it."),
            ("Does it work in mainland China?", "Yes. Kiri works offline once installed. Public datasets download from their original sources, which can be slow in mainland China. A faster mirror is planned."),
        ],
        "foot_tag": "Free statistics and figures for students, on your own computer.",
        "foot_cols": [
            ("Product", [("Download", "#download"), ("Kiri Plus", "plus.html"), ("Release notes", RELEASES)]),
            ("Help", [("Install guide", "install-mac.html"), ("FAQ", "#faq")]),
            ("About", [("Privacy", "#privacy")]),
        ],
        "foot_left": "© 2026 Kiri · Every analysis is free, for good.",
        "foot_right": "NO TRACKING · NO ADS",
        # install guide
        "g_title": "Install Kiri on your Mac",
        "g_started": "Your download has started",
        "g_again": "If nothing happens in a few seconds, download again.",
        "g_soon_h": "The Mac beta isn’t published yet",
        "g_soon_p": "This guide shows what installing will look like. The download link turns on by itself as soon as the first build is published.",
        "g_steps": [
            ("Drag Kiri to Applications", "Open the .dmg file, then drag the Kiri icon onto the Applications folder."),
            ("Open Kiri once, then click Done", "macOS can’t check the beta yet, so it stops the first launch. That’s expected."),
            ("Click Open Anyway", "Go to System Settings › Privacy & Security, scroll down, click Open Anyway, then open Kiri again."),
        ],
        "g_apps": "Applications",
        "g_dlg_t": "macOS can’t check “Kiri”",
        "g_dlg_p": "It isn’t from an identified developer yet.",
        "g_dlg_b": ["Move to Bin", "Done"],
        "g_pane_t": "Privacy & Security",
        "g_pane_p": "“Kiri” was blocked to protect your Mac.",
        "g_pane_b": "Open Anyway",
        "g_help": "Still stuck? Reply to your invitation message and we’ll walk you through it.",
        "g_dl_again": "Download again",
        # plus
        "pl_title": "Kiri Plus",
        "pl_eyebrow": "Kiri Plus",
        "pl_h1": "Kiri is free. Plus helps keep it that way.",
        "pl_sub": "One payment covers every 1.x and 2.x update. No account, no subscription, and none of your analyses ever depend on it.",
        "pl_notyet": "Kiri Plus isn’t on sale yet. It opens after the beta. Nothing on this page charges you.",
        "pl_bubble": "“Every analysis stays free. Plus adds the extras.”",
        "pl_cards": [
            ("Student", "US$9", "Anyone studying. Honour system, no proof needed.", ["All Plus extras", "Use on 3 of your computers", "Every 1.x and 2.x update"], True),
            ("Standard", "US$29", "Researchers, postdocs and staff.", ["All Plus extras", "Use on 3 of your computers", "Every 1.x and 2.x update"], False),
            ("Lab pack", "US$199", "A PI buying for a group or a course. 10 codes.", ["10 separate codes, one per person", "Each code works on 3 computers", "Invoice from the checkout"], False),
        ],
        "pl_once": "once",
        "pl_pick": "Most chosen",
        "pl_btn": "Coming after the beta",
        "pl_foot": "Prices in US dollars before tax. Tax is added at checkout where it applies. Payments will be handled by Stripe; Kiri never sees your card. Refunds within 14 days, no questions asked.",
        "pl_cmp_eyebrow": "Compare",
        "pl_cmp_h2": "What’s free and what’s in Plus",
        "pl_cmp_p": "Anything that affects whether a result is right, or whether you understand it, is free. Plus saves time or adds polish.",
        "pl_free_h": "Free, for good",
        "pl_free": ["Every analysis module and dataset", "Single-figure export: SVG, PDF, 300 dpi PNG", "89 and 183 mm journal sizes", "Reliability and Explain panels", "Notebook, .kiri projects and sample projects", "English, 中文 and Bilingual modes", "Light and dark themes, accessibility settings"],
        "pl_plus_h": "Kiri Plus",
        "pl_plus": ["Batch export: every figure in a project in one click", "Journal style packs", "More report styles, such as a poster layout", "Kiri sticker pack and seasonal outfits", "Your name in About (optional)", "Vote on the next module"],
        "pl_q_h2": "Questions about Plus",
        "pl_faq": [
            ("Do I need an account?", "No. Your code appears on the page after payment and in your email. Paste it into Kiri."),
            ("What if I change computers?", "One code works on 3 computers. A computer that hasn’t been used for 120 days frees its place by itself, or you can remove it in Settings."),
            ("Can I get a refund?", "Yes, within 14 days, no questions asked. Reply to the receipt email."),
            ("Is any of my data uploaded?", "No. Unlocking sends only the code number and a hashed install ID, once. You can turn that off in Settings."),
            ("Can a lab get an invoice?", "Yes. Enter your institution’s details at checkout and Stripe emails the invoice."),
            ("What happens if I don’t buy Plus?", "Nothing changes. Kiri won’t nag you, there is no trial, and no analysis is ever locked."),
        ],
        # 404
        "e_title": "Page not found · Kiri",
        "e_eyebrow": "Error 404",
        "e_h1": "This page wandered off.",
        "e_p": "The link may be old or mistyped. Everything else on the site is where you left it.",
        "e_home": "Go to the home page",
        "e_dl": "Download Kiri",
        "switch": [("EN", ""), ("中文", "zh/")],
    },
    "zh": {
        "html_lang": "zh-CN",
        "prefix": "zh/",
        "title": "Kiri · 论文需要的统计和图表",
        "banner": "此网站仅供受邀测试者预览，请勿分享链接或密码。",
        "signout": "退出",
        "nav": ["下载", "Kiri Plus", "安装指南", "常见问题"],
        "nav_btn": "下载",
        "eyebrow": "学生免费 · Mac 测试版",
        "h1": "在自己的电脑上，完成论文需要的统计和图表。",
        "sub": "Kiri 可以对公开的癌症数据和你自己的表格做生存分析、表达分析和富集分析，用通俗的话解释每个结果，并导出期刊可用的图表。无需账号，无需联网，支持中文和 English。",
        "btn_mac": "下载 Mac 版（测试）",
        "btn_guide": "安装方法",
        "btn_soon": "Mac 测试版即将推出",
        "hero_meta": "macOS 12 Monterey 或更高版本 · Apple 芯片或 Intel 芯片 · 8 GB 内存",
        "hero_meta_ver": "测试版 {v} · macOS 12 或更高版本 · 8 GB 内存",
        "trust": ["无需账号", "数据不离开你的电脑", "可离线使用"],
        "bubble": "“你好，我是 Kiri。这是我为像你一样的学生做的。”",
        "pv_crumbs": "PARL–MAVS in CRC  /  分析  /  生存分析",
        "pv_title": "按 PARL 表达分组的总生存",
        "pv_side": ["主页", "项目", "生存分析", "表达分析", "富集分析", "笔记本", "学习"],
        "pv_cap": "PARL 高表达（n = 219）与低表达（n = 219）。阴影为 95% 置信区间。",
        "pv_ok": "图表检查通过",
        "pv_tabs": ["解读", "可靠性"],
        "pv_explain": "PARL 高表达的患者平均生存更长，这一差异不太可能是偶然的（log-rank p = 0.004）。",
        "pv_note": "这是相关性，不代表因果关系。",
        "pv_by": "由数字生成，非 AI",
        "pv_caption": "应用设计图。测试版的界面可能略有不同。",
        "f_eyebrow": "为什么选择 Kiri",
        "f_h2": "按学生真正的工作方式设计",
        "features": [
            ("shield", "结果诚实可靠", "每个结果都附带可靠性检查。数据太少、不足以下结论时，它会先提醒你，而不是等导师指出。"),
            ("image", "期刊认可的图表", "导出 SVG、PDF 或 300 dpi PNG，宽度 89 或 183 毫米，文字在 Word 和 Illustrator 中仍可编辑。"),
            ("book", "边用边学", "通俗的结果解读和术语表，每个术语都有卡片告诉你它的含义和读法。"),
            ("globe", "中文、English 或双语", "整个界面可切换语言，也可以同时显示两种语言，方便学习术语。"),
        ],
        "h_eyebrow": "使用步骤",
        "h_h2": "从下载到出图，只需十分钟",
        "steps": [
            ("安装", "打开下载的文件，把 Kiri 拖到“应用程序”。大约两分钟，不需要注册账号。"),
            ("打开示例项目", "浏览 TP53 或结直肠癌中的 PARL–MAVS 示例，每一步都有解释。"),
            ("导出到 Word", "选择期刊尺寸，通过图表检查，然后把图粘贴进你的论文。"),
        ],
        "p_h3": "你的数据只留在你的电脑上",
        "p_text": "Kiri 只在下载你需要的公开数据集和检查更新时联网。你自己的文件绝不会上传，也没有任何追踪。",
        "d_eyebrow": "下载",
        "d_h2": "下载 Kiri",
        "d_lead": "所有分析均免费。Kiri 先推出 Mac 版。测试版尚未经过 Apple 公证，第一次打开时系统会请你确认。",
        "d_mac_badge": "测试版",
        "d_mac_file_none": "尚未发布",
        "d_mac_checks": ["macOS 12 Monterey 或更高版本", "Apple 芯片（M1 或更新）。Intel 版本推出后提供", "8 GB 内存"],
        "d_intel": "下载 Intel 芯片版本",
        "d_mac_note": "如果 macOS 提示无法打开 Kiri，请前往“系统设置 › 隐私与安全性”，点击“仍要打开”。",
        "d_soon_note": "第一个 Mac 测试版正在制作中。发布后，这个按钮会自动变为可用。",
        "d_win": "Windows",
        "d_win_badge": "稍后",
        "d_win_text": "Windows 版计划在 Mac 测试版之后推出，目前还不能下载。",
        "d_links": [("图文安装指南", "install-mac.html"), ("更新说明", RELEASES)],
        "t_h3": "所有分析永久免费。",
        "t_text": "Kiri Plus 将是可选的一次性购买，提供批量导出、期刊样式包等附加功能。学生价 9 美元，你的支持让 Kiri 能一直免费。",
        "t_btn": "了解 Plus",
        "q_eyebrow": "常见问题",
        "q_h2": "下载前你可能想知道",
        "faq": [
            ("Kiri 真的免费吗？", "是的。所有分析、数据集、图表导出和语言模式都免费，Kiri Plus 只提供便利功能。"),
            ("需要注册账号吗？", "不需要。Kiri 没有账号系统，下载后打开即可使用。"),
            ("可以用于毕业论文或发表文章吗？", "可以。每个结果都注明所用的方法和软件包，方便引用；图表可按期刊栏宽导出。也请同时查看你所在院系的要求。"),
            ("为什么安装时电脑会弹出警告？", "测试版尚未经过 Apple 公证，所以 macOS 会阻止第一次打开，这是正常的。安装指南里有两步操作即可打开。"),
            ("在中国大陆能用吗？", "能。安装后可离线使用。公开数据集从原始来源下载，在中国大陆可能较慢，我们计划提供国内镜像。"),
        ],
        "foot_tag": "在你自己的电脑上，为学生提供免费的统计和图表。",
        "foot_cols": [
            ("产品", [("下载", "#download"), ("Kiri Plus", "plus.html"), ("更新说明", RELEASES)]),
            ("帮助", [("安装指南", "install-mac.html"), ("常见问题", "#faq")]),
            ("关于", [("隐私", "#privacy")]),
        ],
        "foot_left": "© 2026 Kiri · 所有分析永久免费。",
        "foot_right": "无追踪 · 无广告",
        "g_title": "在 Mac 上安装 Kiri",
        "g_started": "下载已开始",
        "g_again": "如果几秒后没有反应，请重新下载。",
        "g_soon_h": "Mac 测试版尚未发布",
        "g_soon_p": "下面是安装过程的预览。第一个版本发布后，下载链接会自动变为可用。",
        "g_steps": [
            ("把 Kiri 拖到“应用程序”", "打开 .dmg 文件，把 Kiri 图标拖到“应用程序”文件夹。"),
            ("先打开一次 Kiri，再点“完成”", "macOS 暂时无法验证测试版，所以会阻止第一次打开，这是正常的。"),
            ("点击“仍要打开”", "前往“系统设置 › 隐私与安全性”，向下滚动，点击“仍要打开”，然后再次打开 Kiri。"),
        ],
        "g_apps": "应用程序",
        "g_dlg_t": "macOS 无法验证“Kiri”",
        "g_dlg_p": "它暂时不是来自已认证的开发者。",
        "g_dlg_b": ["移到废纸篓", "完成"],
        "g_pane_t": "隐私与安全性",
        "g_pane_p": "已阻止“Kiri”以保护你的 Mac。",
        "g_pane_b": "仍要打开",
        "g_help": "还是打不开？回复邀请消息，我们会一步步帮你。",
        "g_dl_again": "重新下载",
        "pl_title": "Kiri Plus",
        "pl_eyebrow": "Kiri Plus",
        "pl_h1": "Kiri 免费。Plus 让它一直免费。",
        "pl_sub": "一次付款，享受所有 1.x 和 2.x 更新。无需账号，不是订阅，你的任何分析都不依赖它。",
        "pl_notyet": "Kiri Plus 尚未开售，将在测试版之后推出。本页面不会向你收取任何费用。",
        "pl_bubble": "“所有分析都免费，Plus 只是锦上添花。”",
        "pl_cards": [
            ("学生版", "US$9", "所有在读学生。凭诚信购买，无需证明。", ["全部 Plus 功能", "可在你的 3 台电脑上使用", "所有 1.x 和 2.x 更新"], True),
            ("标准版", "US$29", "研究人员、博士后和教职员工。", ["全部 Plus 功能", "可在你的 3 台电脑上使用", "所有 1.x 和 2.x 更新"], False),
            ("课题组套装", "US$199", "课题组长为团队或课程购买，含 10 个激活码。", ["10 个独立激活码，每人一个", "每个激活码可用于 3 台电脑", "结账时可获取发票"], False),
        ],
        "pl_once": "一次性",
        "pl_pick": "最多人选",
        "pl_btn": "测试版之后开放",
        "pl_foot": "价格以美元计，不含税，适用时在结账时加税。付款将由 Stripe 处理，Kiri 不会接触你的银行卡信息。14 天内无理由退款。",
        "pl_cmp_eyebrow": "功能对比",
        "pl_cmp_h2": "免费功能与 Plus 功能",
        "pl_cmp_p": "凡是影响结果是否正确、是否看得懂的功能都免费。Plus 只帮你省时间或让作品更精致。",
        "pl_free_h": "永久免费",
        "pl_free": ["所有分析模块和数据集", "单张图表导出：SVG、PDF、300 dpi PNG", "89 和 183 毫米期刊尺寸", "可靠性与解读面板", "笔记本、.kiri 项目和示例项目", "中文、English 和双语模式", "浅色与深色主题、无障碍设置"],
        "pl_plus_h": "Kiri Plus",
        "pl_plus": ["批量导出：一键导出项目中的全部图表", "期刊样式包", "更多报告样式，如海报版面", "Kiri 贴纸包和节日造型", "可在“关于”中署名（可选）", "为下一个模块投票"],
        "pl_q_h2": "关于 Plus 的问题",
        "pl_faq": [
            ("需要账号吗？", "不需要。激活码会显示在付款后的页面并发到你的邮箱，粘贴到 Kiri 即可。"),
            ("换电脑怎么办？", "一个激活码可用于 3 台电脑。旧电脑 120 天未使用会自动释放名额，也可以在设置中移除。"),
            ("可以退款吗？", "可以，14 天内无理由退款，直接回复收据邮件即可。"),
            ("我的数据会被上传吗？", "不会。解锁时只发送一次激活码编号和一个加密处理过的安装 ID，也可以在设置中关闭。"),
            ("课题组可以开发票吗？", "可以。结账时填写单位信息，Stripe 会通过邮件发送发票。"),
            ("不买 Plus 会怎样？", "什么都不会变。Kiri 不会催你购买，没有试用期，也不会锁定任何分析。"),
        ],
        "e_title": "页面不存在 · Kiri",
        "e_eyebrow": "错误 404",
        "e_h1": "这个页面走丢了。",
        "e_p": "链接可能已过期或输错了。网站其他内容都还在。",
        "e_home": "返回首页",
        "e_dl": "下载 Kiri",
        "switch": [("EN", ""), ("中文", "zh/")],
    },
}


def head(t, title, root):
    return f"""<!doctype html>
<html lang="{t['html_lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title}</title>
<link rel="icon" href="/assets/kiri-portrait.jpg">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
</head>
<body data-release-state="loading">
<div class="banner"><div class="wrap"><span>{t['banner']}</span><form method="post" action="/gate/logout"><button type="submit">{t['signout']}</button></form></div></div>
"""


def nav(t, page):
    p = "/" + t["prefix"]
    home = p
    links = [(t["nav"][0], f"{home}#download"), (t["nav"][1], f"{p}plus.html"), (t["nav"][2], f"{p}install-mac.html"), (t["nav"][3], f"{home}#faq")]
    sw = " / ".join(
        f'<a href="/{pre}{page}"{" aria-current=\"true\"" if pre == t["prefix"] else ""}>{label}</a>' for label, pre in t["switch"]
    )
    return f"""<header class="nav"><div class="wrap">
<a class="logo" href="{home}"><img src="/assets/kiri-portrait.jpg" alt="">Kiri</a>
<nav class="nav-links">{''.join(f'<a href="{h}">{l}</a>' for l, h in links)}</nav>
<div class="nav-right"><span class="lang">{sw}</span>
<a class="btn btn-primary btn-sm" href="{home}#download">{icon('download')}{t['nav_btn']}</a></div>
</div></header>
"""


def footer(t):
    p = "/" + t["prefix"]

    def href(h):
        if h.startswith("http"):
            return h
        if h.startswith("#"):
            return p + h
        return p + h

    cols = "".join(
        f"<div><h4>{name}</h4><ul>{''.join(f'<li><a href=\"{href(h)}\">{l}</a></li>' for l, h in items)}</ul></div>"
        for name, items in t["foot_cols"]
    )
    return f"""<footer class="site"><div class="wrap">
<div class="foot"><div><a class="logo" href="{p}"><img src="/assets/kiri-portrait.jpg" alt="">Kiri</a><p style="margin-top:12px;color:var(--text-2);max-width:300px">{t['foot_tag']}</p></div>{cols}</div>
<div class="foot-bottom"><span>{t['foot_left']}</span><span class="mono">{t['foot_right']}</span></div>
</div></footer>
</body>
</html>
"""


def mac_buttons(t, guide_href):
    return f"""<a class="btn btn-primary if-release" href="{guide_href}?start=1">{icon('download')}{t['btn_mac']}</a>
<span class="btn btn-primary if-none" aria-disabled="true">{icon('laptop')}{t['btn_soon']}</span>"""


def km_svg():
    # Illustrative Kaplan-Meier curves for the app preview.
    hi = [(0, 0), (40, 4), (80, 10), (120, 18), (170, 26), (220, 32), (280, 40), (340, 46), (400, 50), (460, 54), (520, 56)]
    lo = [(0, 0), (30, 8), (70, 22), (110, 38), (150, 52), (200, 64), (250, 74), (300, 82), (360, 90), (430, 96), (520, 100)]

    def steps(pts):
        d = f"M{50 + pts[0][0]},{20 + pts[0][1] * 1.6}"
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            d += f" H{50 + x1} V{20 + y1 * 1.6}"
        return d

    return f"""<svg viewBox="0 0 600 220" role="img" aria-label="Kaplan-Meier curves">
<line x1="50" y1="20" x2="50" y2="190" stroke="#b9ae96"/><line x1="50" y1="190" x2="580" y2="190" stroke="#b9ae96"/>
<text x="10" y="26" font-size="11" fill="#6b6457">1.0</text><text x="10" y="194" font-size="11" fill="#6b6457">0.0</text>
<path d="{steps(hi)}" fill="none" stroke="#2e6a4c" stroke-width="2.5"/>
<path d="{steps(lo)}" fill="none" stroke="#e69f00" stroke-width="2.5"/>
<text x="470" y="96" font-size="12" fill="#245a3f">PARL high</text><text x="470" y="186" font-size="12" fill="#94570f">PARL low</text>
</svg>"""


def index(t):
    p = "/" + t["prefix"]
    guide = f"{p}install-mac.html"
    feats = "".join(
        f'<div class="card"><div class="icon-tile">{icon(i)}</div><h3>{h}</h3><p>{d}</p></div>' for i, h, d in t["features"]
    )
    steps = "".join(
        f'<div class="step"><div class="num">0{n}</div><h3>{h}</h3><p>{d}</p></div>' for n, (h, d) in enumerate(t["steps"], 1)
    )
    faq = "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in t["faq"])
    side = "".join(f'<span class="{"on" if i == 2 else ""}">{s}</span>' for i, s in enumerate(t["pv_side"]))
    checks = "".join(f"<li>{icon('check')}<span>{c}</span></li>" for c in t["d_mac_checks"])
    dlinks = "".join(
        f'<a href="{h if h.startswith("http") else p + h}">{l}</a>' for l, h in t["d_links"]
    )
    return (
        head(t, t["title"], p)
        + nav(t, "")
        + f"""<main>
<section class="hero"><div class="wrap">
<div>
<div class="eyebrow">{t['eyebrow']}</div>
<h1>{t['h1']}</h1>
<p class="lead">{t['sub']}</p>
<div class="actions">{mac_buttons(t, guide)}<a class="btn btn-secondary" href="{guide}">{t['btn_guide']}</a></div>
<p class="mono" data-meta data-meta-ver="{t['hero_meta_ver']}">{t['hero_meta']}</p>
<div class="trust"><span>{icon('user')}{t['trust'][0]}</span><span>{icon('shield')}{t['trust'][1]}</span><span>{icon('offline')}{t['trust'][2]}</span></div>
</div>
<div class="mascot"><img src="/assets/kiri-wave.jpg" alt="Kiri, the app's mascot, waving" width="440" height="440"><div class="bubble">{t['bubble']}</div></div>
</div></section>

<section class="preview"><div class="wrap">
<div class="window" aria-hidden="true"><div class="titlebar"><i></i><i></i><i></i></div>
<div class="app">
<div class="side"><b><img src="/assets/kiri-portrait.jpg" alt="">Kiri</b>{side}</div>
<div class="work"><div class="crumbs">{t['pv_crumbs']}</div><h3>{t['pv_title']}</h3>
<div class="chart">{km_svg()}<div class="cap">{t['pv_cap']}</div></div>
<div class="ok">{icon('check')}{t['pv_ok']}</div></div>
<div class="explain"><div class="tabs"><span>{t['pv_tabs'][0]}</span><span>{t['pv_tabs'][1]}</span></div>
<p>{t['pv_explain']}</p><div class="note-callout">{t['pv_note']}</div><small>{t['pv_by']}</small></div>
</div></div>
<p class="mono caption">{t['pv_caption']}</p>
</div></section>

<section class="block surface"><div class="wrap">
<div class="head"><div class="eyebrow">{t['f_eyebrow']}</div><h2>{t['f_h2']}</h2></div>
<div class="grid4">{feats}</div>
</div></section>

<section class="block" id="privacy"><div class="wrap">
<div class="head"><div class="eyebrow">{t['h_eyebrow']}</div><h2>{t['h_h2']}</h2></div>
<div class="grid3">{steps}</div>
<div class="privacy"><img src="/assets/kiri-portrait.jpg" alt=""><div><h3>{t['p_h3']}</h3><p>{t['p_text']}</p></div></div>
</div></section>

<section class="block surface" id="download"><div class="wrap">
<div class="head"><div class="eyebrow">{t['d_eyebrow']}</div><h2>{t['d_h2']}</h2><p>{t['d_lead']}</p></div>
<div class="dl-grid">
<div class="dl-card main">
<div class="dl-top">{icon('laptop')}<h3>macOS</h3><span class="badge beta">{t['d_mac_badge']}</span></div>
<p class="mono" data-mac-file>{t['d_mac_file_none']}</p>
<ul class="checks">{checks}</ul>
<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">{mac_buttons(t, guide)}
<a class="btn btn-ghost if-release" href="/download/mac?arch=intel" data-intel-link hidden>{t['d_intel']}</a></div>
<div class="callout info if-release">{icon('info')}<span>{t['d_mac_note']}</span></div>
<div class="callout warn if-none">{icon('info')}<span>{t['d_soon_note']}</span></div>
</div>
<div class="dl-card later">
<div class="dl-top">{icon('laptop')}<h3>{t['d_win']}</h3><span class="badge later">{t['d_win_badge']}</span></div>
<p>{t['d_win_text']}</p>
</div>
</div>
<div class="dl-links">{dlinks}</div>
</div></section>

<section class="block" style="padding-bottom:0"><div class="wrap">
<div class="teaser"><div><h3>{t['t_h3']}</h3><p>{t['t_text']}</p></div><a class="btn btn-secondary" href="{p}plus.html">{t['t_btn']}</a></div>
</div></section>

<section class="block" id="faq"><div class="wrap">
<div class="head"><div class="eyebrow">{t['q_eyebrow']}</div><h2>{t['q_h2']}</h2></div>
<div class="faq">{faq}</div>
</div></section>
</main>
"""
        + footer(t)
    )


def install(t):
    p = "/" + t["prefix"]
    s = t["g_steps"]
    mocks = [
        f"""<div class="mock"><div class="row"><div class="tile"><img src="/assets/kiri-portrait.jpg" alt="">Kiri</div><div class="arrow">→</div><div class="tile"><div class="folder"></div>{t['g_apps']}</div></div></div>""",
        f"""<div class="mock"><div class="dlg">{icon('alert')}<b>{t['g_dlg_t']}</b>{t['g_dlg_p']}<div class="btns"><span>{t['g_dlg_b'][0]}</span><span class="blue">{t['g_dlg_b'][1]}</span></div></div></div>""",
        f"""<div class="mock"><div class="pane"><b>{t['g_pane_t']}</b><div class="line"><span>{t['g_pane_p']}</span><span class="blue">{t['g_pane_b']}</span></div></div></div>""",
    ]
    steps = "".join(
        f'<div class="gstep"><div><div class="n">{n}</div><h3>{h}</h3><p>{d}</p></div>{mocks[n - 1]}</div>' for n, (h, d) in enumerate(s, 1)
    )
    return (
        head(t, t["g_title"] + " · Kiri", p)
        + nav(t, "install-mac.html")
        + f"""<main>
<div class="guide-head wrap">
<div class="eyebrow" data-mac-file></div>
<h1 class="if-release">{t['g_started']}</h1>
<p class="if-release">{t['g_again']} <a href="/download/mac">{t['g_dl_again']}</a></p>
<h1 class="if-none">{t['g_soon_h']}</h1>
<p class="if-none">{t['g_soon_p']}</p>
</div>
<div class="guide wrap">{steps}
<div class="callout info">{icon('info')}<span>{t['g_help']}</span></div>
</div>
</main>
"""
        + footer(t)
    )


def plus(t):
    p = "/" + t["prefix"]
    cards = ""
    for name, amt, who, checks, pick in t["pl_cards"]:
        badge = f'<span class="badge pick">{t["pl_pick"]}</span>' if pick else ""
        lis = "".join(f"<li>{icon('check')}<span>{c}</span></li>" for c in checks)
        cards += f"""<div class="price{' pick' if pick else ''}"><div class="dl-top"><h3>{name}</h3>{badge}</div>
<div class="amt">{amt}<small>{t['pl_once']}</small></div><p>{who}</p><ul class="checks">{lis}</ul>
<span class="btn btn-primary" aria-disabled="true">{t['pl_btn']}</span></div>"""
    free = "".join(f"<li>{icon('check')}<span>{c}</span></li>" for c in t["pl_free"])
    plus_l = "".join(f"<li>{icon('leaf')}<span>{c}</span></li>" for c in t["pl_plus"])
    faq = "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in t["pl_faq"])
    return (
        head(t, t["pl_title"] + " · Kiri", p)
        + nav(t, "plus.html")
        + f"""<main>
<section class="hero"><div class="wrap">
<div><div class="eyebrow">{t['pl_eyebrow']}</div><h1>{t['pl_h1']}</h1><p class="lead">{t['pl_sub']}</p>
<div class="callout warn" style="margin-top:28px">{icon('info')}<span>{t['pl_notyet']}</span></div></div>
<div class="mascot"><img src="/assets/kiri-wave.jpg" alt="" width="360" height="360" style="max-width:360px"><div class="bubble">{t['pl_bubble']}</div></div>
</div></section>
<section class="block surface"><div class="wrap">
<div class="price-grid">{cards}</div>
<p class="footnote">{t['pl_foot']}</p>
</div></section>
<section class="block"><div class="wrap">
<div class="head"><div class="eyebrow">{t['pl_cmp_eyebrow']}</div><h2>{t['pl_cmp_h2']}</h2><p>{t['pl_cmp_p']}</p></div>
<div class="compare"><div class="card"><h3>{t['pl_free_h']}</h3><ul class="checks" style="margin-top:14px">{free}</ul></div>
<div class="card"><h3>{t['pl_plus_h']}</h3><ul class="checks" style="margin-top:14px">{plus_l}</ul></div></div>
</div></section>
<section class="block surface"><div class="wrap">
<div class="head"><h2>{t['pl_q_h2']}</h2></div><div class="faq">{faq}</div>
</div></section>
</main>
"""
        + footer(t)
    )


def not_found():
    en, zh = T["en"], T["zh"]
    return (
        head(en, en["e_title"], "/")
        + nav(en, "")
        + f"""<main class="err"><div class="wrap box">
<img src="/assets/kiri-portrait.jpg" alt="">
<div><div class="eyebrow">{en['e_eyebrow']} · {zh['e_eyebrow']}</div>
<h1>{en['e_h1']}<br><span lang="zh-CN">{zh['e_h1']}</span></h1>
<p>{en['e_p']}<br><span lang="zh-CN">{zh['e_p']}</span></p>
<a class="btn btn-primary" href="/">{en['e_home']}</a> <a class="btn btn-ghost" href="/#download">{en['e_dl']}</a></div>
</div></main>
"""
        + footer(en)
    )


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "assets").mkdir(parents=True)
    (OUT / "zh").mkdir()
    for f in ["site.css", "site.js"]:
        shutil.copy(SRC / f, OUT / "assets" / f)
    for f in (SRC.parent / "assets").iterdir():
        shutil.copy(f, OUT / "assets" / f.name)
    for lang, t in T.items():
        base = OUT / t["prefix"]
        (base / "index.html").write_text(index(t), encoding="utf-8")
        (base / "install-mac.html").write_text(install(t), encoding="utf-8")
        (base / "plus.html").write_text(plus(t), encoding="utf-8")
    (OUT / "404.html").write_text(not_found(), encoding="utf-8")
    print("built", sorted(str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file()))


if __name__ == "__main__":
    main()
