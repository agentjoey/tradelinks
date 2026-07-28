import { prisma } from "../db/client.js";
import { createPrismaLockAdapter } from "./prisma-adapter.js";

export const prismaLockAdapter = createPrismaLockAdapter(prisma);
