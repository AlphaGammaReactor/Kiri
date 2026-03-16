
# ===============================================================
# 📘 基于 IOBR 的免疫浸润分析
# 数据集：normalize_GSE62564.txt
# ===============================================================

# ========== 1️⃣ 环境准备 ==========
rm(list = ls()); gc()

# 自动安装并加载依赖包
pkgs <- c("IOBR", "tidyverse", "ggpubr", "rstatix", "ggsci")
for (p in pkgs) {
  if (!require(p, character.only = TRUE)) install.packages(p)
  library(p, character.only = TRUE)
}
#也可尝试以下代码安装IOBR包
#if (!requireNamespace("remotes", quietly = TRUE))
# install.packages("remotes")
#remotes::install_github("IOBR/IOBR")

setwd("F:/scRNA/基础绘图/免疫浸润/MIANYI/")  # 👉 修改为你的工作路径

# ========== 2️⃣ 读取表达矩阵 ==========
expr <- read.table("normalize_GSE62564.txt",
                   header = TRUE, sep = "\t", check.names = FALSE, row.names = 1)

cat("✅ 数据维度:", dim(expr)[1], "genes ×", dim(expr)[2], "samples\n")

# ========== 3️⃣ 运行 CIBERSORT 免疫浸润分析 ==========
res_cibersort <- deconvo_tme(
  eset   = expr,
  method = "cibersort",
  arrays = FALSE,  # RNA-seq 数据设为 FALSE
  perm   = 100     # 置换次数
)

# 检查结果
if (nrow(res_cibersort) == 0) {
  stop("❌ 没有生成免疫浸润结果，请检查基因名格式或表达量单位（
       建议TPM或FPKM）。")
}

# 移除 P 值等统计列
res_cibersort <- res_cibersort[, -c(24:26)]

# 命名免疫细胞列
names(res_cibersort) <- c(
  "ID", "Naive B cells", "Memory B cells", "Plasma cells", "CD8 T cells",
  "Naive CD4 T cells", "Resting CD4 memory T cells", "Activated CD4 memory T cells",
  "Follicular helper T cells", "Regulatory T cells", "Gamma delta T cells",
  "Resting NK cells", "Activated NK cells", "Monocytes",
  "M0 Macrophages", "M1 Macrophages", "M2 Macrophages",
  "Resting dendritic cells", "Activated dendritic cells",
  "Resting mast cells", "Activated mast cells", "Eosinophils", "Neutrophils"
)

# ========== 4️⃣ 数据整形 ==========
violin_dat <- res_cibersort %>%
  pivot_longer(cols = -ID, names_to = "ImmuneCell", values_to = "Score")

# 自定义调色板
mypalette <- c("#FF0000","#D8D8BF","#8E236B","#EAADEA","#BC8F8F","#5959AB","#0000FF",
               "#2F4F4F","#3232CD","#FF00FF","#EAEAAE","#CC3299","#9370DB","#FF6EC7",
               "#545454","#E47833","#856363","#E6E8FA","#3299CC","#9F5F9F","#8E2323",
               "#007FFF","#B5A642","#DB7093","#FF1CAE","#D9D919","#CD7F32","#A68064",
               "#A67D3D","#2F2F4F","#236B8E","#8C7853","#5F9F9F")

# ========== 5️⃣ 绘制堆叠柱状图 ==========
p1 <- ggplot(violin_dat, aes(x = ID, y = Score, fill = ImmuneCell)) +
  geom_bar(stat = "identity", position = "stack") +
  scale_fill_manual(values = mypalette) +
  scale_y_continuous(expand = c(0, 0)) +
  labs(x = "", y = "Relative Percent", fill = "") +
  theme_bw(base_size = 14) +
  theme(axis.text.x = element_blank(),
        axis.ticks.x = element_blank(),
        legend.position = "top")

ggsave("01.CIBERSORT_StackedBar.pdf", plot = p1, width = 12, height = 6)
ggsave("01.CIBERSORT_StackedBar.png", plot = p1, width = 12, height = 6, dpi = 300)

# ========== 6️⃣ 绘制总体箱线图 ==========
p2 <- ggboxplot(violin_dat,
                x = "ImmuneCell", y = "Score",
                fill = "ImmuneCell", palette = "npg") +
  labs(x = "", y = "Relative Percent", fill = "") +
  theme_bw(base_size = 14) +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        legend.position = "none")

ggsave("02.CIBERSORT_Boxplot.pdf", plot = p2, width = 12, height = 7)
ggsave("02.CIBERSORT_Boxplot.png", plot = p2, width = 12, height = 7, dpi = 600)

# ========== 7️⃣ 导出结果 ==========
write.csv(res_cibersort, "Immune_Infiltration_CIBERSORT.csv", row.names = FALSE)
cat("✅ 无分组免疫浸润分析完成并导出结果。\n")
