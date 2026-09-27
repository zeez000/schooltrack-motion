import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";
type JsonParseError=SyntaxError&{status?:number;body?:unknown};
export const errorHandler:ErrorRequestHandler=(error:unknown,request,response,next)=>{
  if(response.headersSent){next(error);return;}
  const malformed=error instanceof SyntaxError&&(error as JsonParseError).status===400&&"body" in error;
  let apiError:ApiError; let details:unknown;
  if(error instanceof ApiError) apiError=error;
  else if(error instanceof ZodError){apiError=new ApiError(400,"VALIDATION_ERROR","The request contains invalid data.");details=error.issues.map(issue=>({path:issue.path.join("."),message:issue.message}));}
  else if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002") apiError=new ApiError(409,"CONFLICT","A record with these unique values already exists.");
  else if(malformed) apiError=new ApiError(400,"INVALID_JSON","The request body contains malformed JSON.");
  else apiError=new ApiError(500,"INTERNAL_SERVER_ERROR","An unexpected error occurred.");
  const requestId=String(request.id??response.getHeader("x-request-id")??"unknown");
  if(apiError.status>=500)logger.error({err:error,requestId},"Unhandled request error");
  response.status(apiError.status).json({error:{code:apiError.code,message:apiError.message,requestId,...(details?{details}:{})}});
};
