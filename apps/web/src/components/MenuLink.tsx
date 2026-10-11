"use client";

// ลิงก์ "กลับเมนูฝึก / ออก" ของหน้ากิจกรรม → เมนูทักษะที่เพิ่งมา (รวมหมวดที่เลือกไว้) แทนที่จะเด้งไปหน้ารวม
import Link from "next/link";
import type { ComponentProps } from "react";
import { usePracticeMenuHref, type HubGroup } from "@/lib/practice-menu";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { group?: HubGroup };

export function MenuLink({ group, ...rest }: Props) {
  const href = usePracticeMenuHref(group);
  return <Link href={href} {...rest} />;
}
