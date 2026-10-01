import { prisma } from "./database.js";
import { ApiError } from "../utils/api-error.js";

export function dateOnlyInTimeZone(input: Date, timeZone: string): Date {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(input);
  } catch {
    throw new ApiError(500, "SCHOOL_TIMEZONE_INVALID", "The school timezone configuration is invalid.");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values["year"]);
  const month = Number(values["month"]);
  const day = Number(values["day"]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new ApiError(500, "SCHOOL_TIMEZONE_INVALID", "The school timezone configuration is invalid.");
  }
  return new Date(Date.UTC(year, month - 1, day));
}

export async function schoolDateOnly(schoolId: string, input = new Date()): Promise<Date> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
  if (!school) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found.");
  return dateOnlyInTimeZone(input, school.timezone);
}

export function nextDateOnly(input: Date): Date {
  return new Date(input.getTime() + 86_400_000);
}
