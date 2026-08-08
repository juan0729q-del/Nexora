"use client";

import { useEffect, useState } from "react";
import { colombiaDepartments } from "@/lib/colombia-locations";
import type { ShippingDestinationInput } from "@/lib/shipping/types";

type Municipality = { name: string; daneCode: string };
const commonCountries = [
  ["CO", "Colombia"], ["US", "Estados Unidos"], ["CA", "Canadá"], ["MX", "México"],
  ["ES", "España"], ["GB", "Reino Unido"], ["DE", "Alemania"], ["FR", "Francia"],
  ["IT", "Italia"], ["BR", "Brasil"], ["CL", "Chile"], ["PE", "Perú"], ["EC", "Ecuador"],
] as const;

export function ColombiaLocationFields({ destination, onChange }: {
  destination: ShippingDestinationInput;
  onChange: (field: keyof ShippingDestinationInput, value: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [municipalityDaneCode, setMunicipalityDaneCode] = useState("");
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const isColombia = destination.countryCode === "CO";
  const usesCustomCountry = !commonCountries.some(([code]) => code === destination.countryCode);

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
    <Field label="País">
      <select value={usesCustomCountry ? "__OTHER__" : destination.countryCode} onChange={(event) => {
        onChange("countryCode", event.target.value === "__OTHER__" ? "" : event.target.value);
        setDepartmentId("");
        setMunicipalities([]);
        setMunicipalityDaneCode("");
        onChange("region", "");
        onChange("city", "");
        onChange("postalCode", "");
      }} required autoComplete="country">
        {commonCountries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        <option value="__OTHER__">Otro país</option>
      </select>
      {usesCustomCountry && <input className="mt-2 uppercase" value={destination.countryCode} onChange={(event) => onChange("countryCode", event.target.value.slice(0, 2))} required minLength={2} maxLength={2} placeholder="Código ISO, ej. AR" aria-label="Código ISO del país" />}
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
      <Field label="Estado / provincia"><input value={destination.region} onChange={(event) => onChange("region", event.target.value)} required autoComplete="address-level1" /></Field>
      <Field label="Ciudad"><input value={destination.city} onChange={(event) => onChange("city", event.target.value)} required autoComplete="address-level2" /></Field>
    </>}

    <Field label={isColombia ? "Código postal (automático con 4-72)" : "Código postal"}>
      <input value={destination.postalCode} onChange={(event) => onChange("postalCode", event.target.value)} required inputMode="numeric" autoComplete="postal-code" readOnly={isColombia && Boolean(destination.postalCode)} placeholder={isColombia ? "Se completa al indicar la dirección" : undefined} />
    </Field>
    {locationStatus && <p aria-live="polite" className="sm:col-span-3 text-[11px] leading-4 text-silver/65">{locationStatus}</p>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-white">{label}
    <span className="mt-1.5 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-silver/25 [&_input]:bg-onyx [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:font-normal [&_input]:text-white [&_input]:placeholder:text-silver/40 [&_input]:focus:border-emerald [&_input]:focus:outline-none [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-silver/25 [&_select]:bg-onyx [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:font-normal [&_select]:text-white [&_select]:focus:border-emerald [&_select]:focus:outline-none [&_select:disabled]:opacity-50">{children}</span>
  </label>;
}
