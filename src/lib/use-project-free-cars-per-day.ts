// 프로젝트별 1일 무료 대수 조회·저장(정산/리포트 공통)
"use client";

import { useCallback, useEffect, useState } from "react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { clampFreeCarsPerDay } from "@/lib/free-cars-per-day";
import type { Project } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

export function useProjectFreeCarsPerDay(projectId: string, project: Project | null) {
  const devStore = useDevStore();
  const [freeCarsPerDay, setFreeCarsPerDayState] = useState(1);

  useEffect(() => {
    if (!project) return;
    setFreeCarsPerDayState(clampFreeCarsPerDay(project.free_cars_per_day));
  }, [project?.id, project?.free_cars_per_day]);

  const setFreeCarsPerDay = useCallback(
    async (value: number) => {
      const next = clampFreeCarsPerDay(value);
      setFreeCarsPerDayState(next);
      if (isDevMode()) {
        devStore.updateProject(projectId, {
          free_cars_per_day: next,
          updated_at: new Date().toISOString(),
        });
        return;
      }
      const { error } = await supabase
        .from("projects")
        .update({ free_cars_per_day: next, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) console.error("[free_cars_per_day]", error);
    },
    [projectId, devStore]
  );

  return { freeCarsPerDay, setFreeCarsPerDay };
}
