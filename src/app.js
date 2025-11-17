import cookieParser from "cookie-parser";
import express from "express"
import cors from "cors"
import compression from "compression";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errorHandler.middleware";

const app = express()

app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);


app.use(express.json({limit:"20kb"}))
app.use(cookieParser())
app.use(compression());

app.use(helmet());

app.use(cors({
    origin:"*",
    credentials:true
}))


app.get("/", (req, res) => {
  res.send("News Bullet Kerala Backend Running 🚀");
});



app.use(notFound)

app.use(errorHandler)


export {app}