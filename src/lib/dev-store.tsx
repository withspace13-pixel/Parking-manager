"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ParkingRecord, Project, ProjectRoom } from "./supabase";
import { DEV_STORAGE_KEY } from "./dev-mode";

type DevData = {
  projects: Project[];
  project_rooms: ProjectRoom[];
  parking_records: ParkingRecord[];
};

function loadFromStorage(): DevData {
  if (typeof window === "undefined")
    return { projects: [], project_rooms: [], parking_records: [] };
  try {
    const raw = localStorage.getItem(DEV_STORAGE_KEY);
    if (!raw) return { projects: [], project_rooms: [], parking_records: [] };
    const parsed = JSON.parse(raw) as DevData;
    return {
      projects: parsed.projects ?? [],
      project_rooms: parsed.project_rooms ?? [],
      parking_records: parsed.parking_records ?? [],
    };
  } catch {
    return { projects: [], project_rooms: [], parking_records: [] };
  }
}

function saveToStorage(data: DevData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

type DevStoreContextValue = {
  data: DevData;
  setData: React.Dispatch<React.SetStateAction<DevData>>;
  // 액션: 저장까지 한 번에
  save: (next: DevData) => void;
  getProjects: () => Project[];
  getProjectsByDate: (date: string) => Project[];
  getProject: (id: string) => Project | null;
  createProject: (input: Omit<Project, "id">, rooms?: { date: string; room_name: string }[]) => Project;
  updateProject: (id: string, input: Partial<Omit<Project, "id">>) => void;
  getRooms: (projectId: string) => ProjectRoom[];
  saveRooms: (projectId: string, rooms: { date: string; room_name: string }[]) => void;
  getParkingRecords: (projectId: string, date?: string) => ParkingRecord[];
  upsertParkingRecord: (record: Omit<ParkingRecord, "id">) => ParkingRecord;
  deleteParkingRecord: (id: string) => void;
  deleteProject: (id: string) => void;
};

const DevStoreContext = createContext<DevStoreContextValue | null>(null);

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function DevStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DevData>(loadFromStorage);

  const save = useCallback((next: DevData) => {
    setData(next);
    saveToStorage(next);
  }, []);

  const getProjects = useCallback(() => {
    return [...data.projects].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
  }, [data.projects]);

  const getProjectsByDate = useCallback(
    (date: string) => {
      const d = new Date(date);
      return data.projects.filter((p) => {
        const s = new Date(p.start_date).getTime();
        const e = new Date(p.end_date).getTime();
        const t = d.getTime();
        return t >= s && t <= e;
      });
    },
    [data.projects]
  );

  const getProject = useCallback(
    (id: string) => data.projects.find((p) => p.id === id) ?? null,
    [data.projects]
  );

  const createProject = useCallback(
    (input: Omit<Project, "id">, roomList?: { date: string; room_name: string }[]) => {
      const project: Project = { ...input, id: uuid() };
      const rooms: ProjectRoom[] = (roomList ?? []).map((r) => ({
        id: uuid(),
        project_id: project.id,
        date: r.date,
        room_name: r.room_name,
      }));
      const next: DevData = {
        projects: [...data.projects, project],
        project_rooms: [...data.project_rooms, ...rooms],
        parking_records: data.parking_records,
      };
      save(next);
      return project;
    },
    [data, save]
  );

  const updateProject = useCallback(
    (id: string, input: Partial<Omit<Project, "id">>) => {
      const next = {
        ...data,
        projects: data.projects.map((p) =>
          p.id === id ? { ...p, ...input } : p
        ),
      };
      save(next);
    },
    [data, save]
  );

  const getRooms = useCallback(
    (projectId: string) =>
      data.project_rooms.filter((r) => r.project_id === projectId),
    [data.project_rooms]
  );

  const saveRooms = useCallback(
    (projectId: string, rooms: { date: string; room_name: string }[]) => {
      const rest = data.project_rooms.filter((r) => r.project_id !== projectId);
      const newRooms: ProjectRoom[] = rooms.map((r) => ({
        id: uuid(),
        project_id: projectId,
        date: r.date,
        room_name: r.room_name,
      }));
      save({
        ...data,
        project_rooms: [...rest, ...newRooms],
      });
    },
    [data, save]
  );

  const getParkingRecords = useCallback(
    (projectId: string, date?: string) => {
      let list = data.parking_records.filter((r) => r.project_id === projectId);
      if (date) list = list.filter((r) => r.date === date);
      // 입력한 순서 유지 (정렬 없음)
      return list;
    },
    [data.parking_records]
  );

  const upsertParkingRecord = useCallback(
    (record: Omit<ParkingRecord, "id">) => {
      const existing = data.parking_records.find(
        (r) =>
          r.project_id === record.project_id &&
          r.vehicle_num === record.vehicle_num &&
          r.date === record.date
      );
      const updated: ParkingRecord = existing
        ? { ...existing, ...record }
        : { ...record, id: uuid() };

      const nextRecords = existing
        ? data.parking_records.map((r) =>
            r.project_id === record.project_id &&
            r.vehicle_num === record.vehicle_num &&
            r.date === record.date
              ? updated
              : r
          )
        : [...data.parking_records, updated];

      save({ ...data, parking_records: nextRecords });
      return updated;
    },
    [data, save]
  );

  const deleteParkingRecord = useCallback(
    (id: string) => {
      save({
        ...data,
        parking_records: data.parking_records.filter((r) => r.id !== id),
      });
    },
    [data, save]
  );

  const deleteProject = useCallback(
    (id: string) => {
      save({
        projects: data.projects.filter((p) => p.id !== id),
        project_rooms: data.project_rooms.filter((r) => r.project_id !== id),
        parking_records: data.parking_records.filter((r) => r.project_id !== id),
      });
    },
    [data, save]
  );

  const value = useMemo<DevStoreContextValue>(
    () => ({
      data,
      setData,
      save,
      getProjects,
      getProjectsByDate,
      getProject,
      createProject,
      updateProject,
      getRooms,
      saveRooms,
      getParkingRecords,
      upsertParkingRecord,
      deleteParkingRecord,
      deleteProject,
    }),
    [
      data,
      save,
      getProjects,
      getProjectsByDate,
      getProject,
      createProject,
      updateProject,
      getRooms,
      saveRooms,
      getParkingRecords,
      upsertParkingRecord,
      deleteParkingRecord,
      deleteProject,
    ]
  );

  return (
    <DevStoreContext.Provider value={value}>
      {children}
    </DevStoreContext.Provider>
  );
}

export function useDevStore(): DevStoreContextValue {
  const ctx = useContext(DevStoreContext);
  if (!ctx) throw new Error("useDevStore must be used inside DevStoreProvider");
  return ctx;
}
