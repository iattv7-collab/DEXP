// public/js/services/vin/vin-decoder-service.js

export async function decodeVIN(vin = "") {
    const cleanVin = String(vin).trim().toUpperCase();

    if (!cleanVin || cleanVin.length !== 17) {
        return {
            year: "",
            make: "",
            model: ""
        };
    }

    const url =
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${cleanVin}?format=json`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("VIN decode request failed");
    }

    const data = await response.json();
    const result = data.Results && data.Results[0] ? data.Results[0] : {};

    return {
        year: result.ModelYear || "",
        make: result.Make || "",
        model: result.Model || ""
    };
}