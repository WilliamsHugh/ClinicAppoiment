import { createDoctorApp } from "./app.js";
import { createPool } from "./db.js";
import { createAppointmentOccupancy, createUserDirectory } from "./dependencies.js";
import { DoctorRepository } from "./repository.js";

const port = Number(process.env.DOCTOR_SERVICE_PORT ?? 3002);
const internalToken = process.env.DOCTOR_INTERNAL_API_TOKEN ?? "";
const repository = new DoctorRepository(createPool());
const app = createDoctorApp(repository, createUserDirectory(), createAppointmentOccupancy(), internalToken);

app.listen(port, () => console.log(`Doctor Service listening on port ${port}`));
