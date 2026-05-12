import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGODB_URL"])
    return _client[os.environ.get("MONGODB_DB", "amplify")]


async def close_client() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
