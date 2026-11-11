/** 分类的持久化深度；根分类为第一层。 */
export const MAX_CATEGORY_DEPTH = 2;
export const CATEGORY_DEPTH_MESSAGE = `分类最多支持 ${MAX_CATEGORY_DEPTH} 层，含子分类的分类只能放在顶层`;
/** 与迁移触发器中的固定错误标记保持一致。 */
export const CATEGORY_DEPTH_CONSTRAINT = 'category_depth_limit';
