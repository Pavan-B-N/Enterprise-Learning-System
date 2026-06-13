FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV MONGODB_URI=mongodb://localhost:27017
ENV MONGODB_DB=enterprise_learning
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8010

EXPOSE 8010

CMD ["python", "server.py"]
