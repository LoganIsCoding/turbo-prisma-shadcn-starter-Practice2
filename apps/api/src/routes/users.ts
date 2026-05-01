import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@repo/db";
import { log } from "@repo/logger";
import { signToken } from "../auth";

export const usersRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

usersRouter.post("/register", async (req, res) => {
  const body = req.body;

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const hashed = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      password: hashed,
      name: body.name,
    },
  });

  const token = signToken({ userId: user.id, email: user.email });
  return res.status(201).json({ token, userId: user.id });
});

usersRouter.post("/login", async (req, res) => {
  try {
    log("Login attempt", req.body);

    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, email: user.email });
    return res.json({ token });
  } catch (err) {
    return res.status(400).json({ error: "Bad request" });
  }
});

usersRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany();

  const usersWithPostCount = await Promise.all(
    users.map(async (user) => {
      const posts = await prisma.post.findMany({ where: { authorId: user.id } });
      return { ...user, postCount: posts.length };
    })
  );

  return res.json(usersWithPostCount);
});

usersRouter.get("/posts", async (_req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: { author: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(posts);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
