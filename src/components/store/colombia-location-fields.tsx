"use client";

import { useEffect, useState } from "react";
import { colombiaDepartments } from "@/lib/colombia-locations";
import type { Market } from "@/lib/i18n/config";
import type { ShippingDestinationInput } from "@/lib/shipping/types";

type Municipality = { name: string; daneCode: string };
const usStates = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

export function MarketLocationFields({ market, destination, onChange }: {
  market: Market;
  destination: ShippingDestinationInput;
  onChange: (field: keyof ShippingDestinationInput, value: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [municipalityDaneCode, setMunicipalityDaneCode] = useState("");
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const isColombia = market === "co";

  useEffect(() => {
    if (!isColombia || !departmentId) return;
    const controller = new AbortController();
    fetch(`/api/locations/colombia?department=${encodeURIComponent(departmentId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { municipalities?: Municipality[]; message?: string };
        if (!response.ok || !payload.municipalities) throw new Error(payload.message || "No fue posible cargar los municipios.");
        setMunicipalities(payload.municipalities);
        setLocationStatus(null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMunicipalities([]);
        setLocationStatus(error instanceof Error ? error.message : "No fue posible cargar los municipios.");
      });
    return () => controller.abort();
  }, [departmentId, isColombia]);

  useEffect(() => {
    if (!isColombia || !departmentId || !municipalityDaneCode || !destination.address1 || !destination.houseNumber) return;
    const municipality = municipalities.find((entry) => entry.daneCode === municipalityDaneCode);
    if (!municipality) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setLocationStatus("Calculando código postal con 4-72…");
        const response = await fetch("/api/locations/colombia/postal-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId,
            municipality: municipality.name,
            municipalityDaneCode,
            address: `${destination.address1} ${destination.houseNumber} ${destination.address2 || ""}`.trim(),
          }),
          signal: controller.signal,
        });
        const payload = await response.json() as { postalCode?: string; message?: string };
        if (!response.ok || !payload.postalCode) throw new Error(payload.message || "No fue posible calcular el código postal.");
        onChange("postalCode", payload.postalCode);
        setLocationStatus(`Código postal ${payload.postalCode} confirmado por 4-72.`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLocationStatus(error instanceof Error ? error.message : "Ingresa el código postal manualmente.");
      }
    }, 900);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [departmentId, destination.address1, destination.address2, destination.houseNumber, isColombia, municipalities, municipalityDaneCode, onChange]);

  function chooseDepartment(value: string) {
    setDepartmentId(value);
    setMunicipalityDaneCode("");
    setLocationStatus(value ? "Cargando municipios oficiales…" : null);
    const department = colombiaDepartments.find((entry) => entry.id === value);
    onChange("region", department?.name || "");
    onChange("city", "");
    onChange("postalCode", "");
  }

  function chooseMunicipality(value: string) {
    setMunicipalityDaneCode(value);
    onChange("city", municipalities.find((entry) => entry.daneCode === value)?.name || "");
    onChange("postalCode", "");
  }

  return <>
    <Field label={isColombia ? "País" : "Country"}>
      <input value={isColombia ? "Colombia" : "United States"} readOnly autoComplete="country-name" />
    </Field>

    {isColombia ? <>
      <Field label="Departamento">
        <select value={departmentId} onChange={(event) => chooseDepartment(event.target.value)} required autoComplete="address-level1">
          <option value="">Selecciona un departamento</option>
          {colombiaDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </Field>
      <Field label="Ciudad / municipio">
        <select value={municipalityDaneCode} onChange={(event) => chooseMunicipality(event.target.value)} required disabled={!departmentId || !municipalities.length} autoComplete="address-level2">
          <option value="">{departmentId ? "Selecciona un municipio" : "Elige primero el departamento"}</option>
          {municipalities.map((municipality) => <option key={municipality.daneCode} value={municipality.daneCode}>{municipality.name}</option>)}
        </select>
      </Field>
    </> : <>
      <Field label="State">
        <select value={destination.region} onChange={(event) => { onChange("region", event.target.value); onChange("postalCode", ""); }} required autoComplete="address-level1">
          <option value="">Select a state</option>
          {usStates.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </Field>
      <Field label="City"><input value={destination.city} onChange={(event) => onChange("city", event.target.value)} required autoComplete="address-level2" /></Field>
    </>}

    <Field label={isColombia ? "Código postal (automático con 4-72)" : "ZIP code"}>
      <input value={destination.postalCode} onChange={(event) => onChange("postalCode", event.target.value)} required inputMode="numeric" autoComplete="postal-code" pattern={isColombia ? "[0-9]{6}" : "[0-9]{5}(-[0-9]{4})?"} readOnly={isColombia && Boolean(destination.postalCode)} placeholder={isColombia ? "Se completa al indicar la dirección" : "12345"} />
    </Field>
    {locationStatus && <p aria-live="polite" className="sm:col-span-3 text-[11px] leading-4 text-silver/65">{locationStatus}</p>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-white">{label}
    <span className="mt-1.5 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-silver/25 [&_input]:bg-onyx [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:font-normal [&_input]:text-white [&_input]:placeholder:text-silver/40 [&_input]:focus:border-emerald [&_input]:focus:outline-none [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-silver/25 [&_select]:bg-onyx [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:font-normal [&_select]:text-white [&_select]:focus:border-emerald [&_select]:focus:outline-none [&_select:disabled]:opacity-50">{children}</span>
  </label>;
}
