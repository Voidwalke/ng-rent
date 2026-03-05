import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, any>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        // Если уже в нужном формате (пагинация) — оборачиваем meta
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'total' in result
        ) {
          const { data, ...meta } = result;
          return { data, meta };
        }

        // Если массив — оборачиваем
        if (Array.isArray(result)) {
          return { data: result, meta: {} };
        }

        // Обычный объект — просто data
        return { data: result, meta: {} };
      }),
    );
  }
}
