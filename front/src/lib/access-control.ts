export type AccessRole = {
  id: string;
  name: string;
};

export type AccessService = string;

export type RoleServiceAccess = Record<string, Record<AccessService, boolean>>;

export type AccessControlState = {
  roles: AccessRole[];
  services: AccessService[];
  roleServiceAccess: RoleServiceAccess;
};

export const ACCESS_CONTROL_STORAGE_KEY = "intelverse:access-control";
export const ACCESS_CONTROL_UPDATED_EVENT = "intelverse:access-control-updated";

const fallbackState: AccessControlState = {
  roles: [
    { id: "guest", name: "Guest" },
    { id: "client", name: "Client" },
    { id: "partenaire", name: "Partenaire" },
  ],
  services: ["Training Center", "Pitch Room", "Showcase Room", "Opportunity Room"],
  roleServiceAccess: {
    guest: {
      "Showcase Room": true,
      "Training Center": false,
      "Pitch Room": false,
      "Opportunity Room": false,
    },
    client: {
      "Showcase Room": true,
      "Training Center": true,
      "Pitch Room": false,
      "Opportunity Room": true,
    },
    partenaire: {
      "Showcase Room": true,
      "Training Center": true,
      "Pitch Room": true,
      "Opportunity Room": true,
    },
  },
};

export function getDefaultAccessControlState(): AccessControlState {
  return fallbackState;
}

export function loadAccessControlState(): AccessControlState {
  if (typeof window === "undefined") {
    return fallbackState;
  }

  try {
    const raw = window.localStorage.getItem(ACCESS_CONTROL_STORAGE_KEY);
    if (!raw) {
      return fallbackState;
    }

    const parsed = JSON.parse(raw) as Partial<AccessControlState>;

    if (!Array.isArray(parsed.roles) || !Array.isArray(parsed.services) || !parsed.roleServiceAccess) {
      return fallbackState;
    }

    const roles = parsed.roles.filter((role): role is AccessRole => {
      return Boolean(role && typeof role.id === "string" && typeof role.name === "string");
    });

    const services = parsed.services.filter((service): service is string => typeof service === "string");

    if (!roles.length || !services.length) {
      return fallbackState;
    }

    const roleServiceAccess: RoleServiceAccess = {};
    for (const role of roles) {
      const source = parsed.roleServiceAccess?.[role.id] ?? {};
      roleServiceAccess[role.id] = services.reduce<Record<string, boolean>>((acc, service) => {
        acc[service] = Boolean(source[service]);
        return acc;
      }, {});
    }

    return { roles, services, roleServiceAccess };
  } catch {
    return fallbackState;
  }
}

export function saveAccessControlState(state: AccessControlState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_CONTROL_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(ACCESS_CONTROL_UPDATED_EVENT));
}
