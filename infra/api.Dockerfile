FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS build
WORKDIR /src
COPY backend/ backend/
COPY database/ database/
RUN dotnet publish backend/src/StockMS.Api/StockMS.Api.csproj -c Release -o /publish
FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime
# Matching major version for pg_dump and pg_restore, including their libraries.
FROM postgres:16-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl libfontconfig1 fonts-dejavu-core libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
COPY --from=runtime /usr/share/dotnet /usr/share/dotnet
RUN ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet && mkdir -p /app /var/lib/stockroom && chown -R postgres:postgres /app /var/lib/stockroom
WORKDIR /app
COPY --from=build /publish/ ./
ENV DOTNET_ROOT=/usr/share/dotnet ASPNETCORE_URLS=http://0.0.0.0:8080 STORAGE_DIR=/var/lib/stockroom
USER postgres
EXPOSE 8080
ENTRYPOINT ["dotnet", "StockMS.Api.dll"]
CMD []
