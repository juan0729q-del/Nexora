export type ColombiaDepartment = {
  id: string;
  name: string;
  daneCode: string;
};

/** Catálogo oficial de la capa Departamentos del visor postal de 4-72. */
export const colombiaDepartments: ColombiaDepartment[] = [
  ["10334", "Amazonas", "91"], ["10306", "Antioquia", "05"], ["10330", "Arauca", "81"],
  ["10307", "Atlántico", "08"], ["10308", "Bogotá, D.C.", "11"], ["10309", "Bolívar", "13"],
  ["10310", "Boyacá", "15"], ["10311", "Caldas", "17"], ["10312", "Caquetá", "18"],
  ["10331", "Casanare", "85"], ["10313", "Cauca", "19"], ["10314", "Cesar", "20"],
  ["10317", "Chocó", "27"], ["10315", "Córdoba", "23"], ["10316", "Cundinamarca", "25"],
  ["10335", "Guainía", "94"], ["10336", "Guaviare", "95"], ["10318", "Huila", "41"],
  ["10319", "La Guajira", "44"], ["10320", "Magdalena", "47"], ["10321", "Meta", "50"],
  ["10322", "Nariño", "52"], ["10323", "Norte de Santander", "54"], ["10332", "Putumayo", "86"],
  ["10324", "Quindío", "63"], ["10325", "Risaralda", "66"], ["10333", "San Andrés y Providencia", "88"],
  ["10326", "Santander", "68"], ["10327", "Sucre", "70"], ["10328", "Tolima", "73"],
  ["10329", "Valle del Cauca", "76"], ["10337", "Vaupés", "97"], ["10338", "Vichada", "99"],
].map(([id, name, daneCode]) => ({ id, name, daneCode }));

export function getColombiaDepartment(id: string) {
  return colombiaDepartments.find((department) => department.id === id);
}
