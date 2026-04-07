FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    poppler-utils \
    curl jq \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages \
    python-docx pymupdf openpyxl

WORKDIR /home/user

COPY server.py /opt/sandbox/server.py

EXPOSE 8080

CMD ["python3", "/opt/sandbox/server.py"]
