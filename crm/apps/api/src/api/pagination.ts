import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function getPagination(query: { page: number; page_size: number }) {
  const skip = (query.page - 1) * query.page_size;
  const take = query.page_size;

  return {
    skip,
    take,
    page: query.page,
    pageSize: query.page_size,
  };
}

export function listResponse<T>(items: T[], query: { page: number; page_size: number }, total?: number) {
  return {
    items,
    page: query.page,
    pageSize: query.page_size,
    total,
  };
}
