"""The 33 TCGA cancer types, with English and Chinese names."""

TCGA = [
    ("ACC", "Adrenocortical carcinoma", "肾上腺皮质癌"),
    ("BLCA", "Bladder urothelial carcinoma", "膀胱尿路上皮癌"),
    ("BRCA", "Breast invasive carcinoma", "乳腺浸润性癌"),
    ("CESC", "Cervical squamous cell carcinoma and endocervical adenocarcinoma", "宫颈鳞癌和宫颈腺癌"),
    ("CHOL", "Cholangiocarcinoma", "胆管癌"),
    ("COAD", "Colon adenocarcinoma", "结肠腺癌"),
    ("DLBC", "Diffuse large B-cell lymphoma", "弥漫大B细胞淋巴瘤"),
    ("ESCA", "Esophageal carcinoma", "食管癌"),
    ("GBM", "Glioblastoma multiforme", "多形性胶质母细胞瘤"),
    ("HNSC", "Head and neck squamous cell carcinoma", "头颈鳞状细胞癌"),
    ("KICH", "Kidney chromophobe", "肾嫌色细胞癌"),
    ("KIRC", "Kidney renal clear cell carcinoma", "肾透明细胞癌"),
    ("KIRP", "Kidney renal papillary cell carcinoma", "肾乳头状细胞癌"),
    ("LAML", "Acute myeloid leukemia", "急性髓系白血病"),
    ("LGG", "Brain lower grade glioma", "低级别胶质瘤"),
    ("LIHC", "Liver hepatocellular carcinoma", "肝细胞癌"),
    ("LUAD", "Lung adenocarcinoma", "肺腺癌"),
    ("LUSC", "Lung squamous cell carcinoma", "肺鳞癌"),
    ("MESO", "Mesothelioma", "间皮瘤"),
    ("OV", "Ovarian serous cystadenocarcinoma", "卵巢浆液性囊腺癌"),
    ("PAAD", "Pancreatic adenocarcinoma", "胰腺癌"),
    ("PCPG", "Pheochromocytoma and paraganglioma", "嗜铬细胞瘤和副神经节瘤"),
    ("PRAD", "Prostate adenocarcinoma", "前列腺癌"),
    ("READ", "Rectum adenocarcinoma", "直肠腺癌"),
    ("SARC", "Sarcoma", "肉瘤"),
    ("SKCM", "Skin cutaneous melanoma", "皮肤黑色素瘤"),
    ("STAD", "Stomach adenocarcinoma", "胃癌"),
    ("TGCT", "Testicular germ cell tumors", "睾丸生殖细胞肿瘤"),
    ("THCA", "Thyroid carcinoma", "甲状腺癌"),
    ("THYM", "Thymoma", "胸腺瘤"),
    ("UCEC", "Uterine corpus endometrial carcinoma", "子宫内膜癌"),
    ("UCS", "Uterine carcinosarcoma", "子宫癌肉瘤"),
    ("UVM", "Uveal melanoma", "葡萄膜黑色素瘤"),
]


def all_types() -> list[dict]:
    return [{"code": c, "en": en, "zh": zh, "project": f"TCGA-{c}"} for c, en, zh in TCGA]
