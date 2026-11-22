from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Photo, Visit

from .models import ImportItem, ImportRun
from .serializers import ImportItemSerializer, ImportRunSerializer, ReviewSerializer


class ImportRunList(generics.ListAPIView):
    serializer_class = ImportRunSerializer
    queryset = ImportRun.objects.annotate(**{
        result: Count("items", filter=Q(items__result=result))
        for result in ImportItem.Result.values
    })


class ImportItemList(generics.ListAPIView):
    serializer_class = ImportItemSerializer

    @cached_property
    def run(self):
        return get_object_or_404(ImportRun, pk=self.kwargs["run_id"])

    def get_queryset(self):
        items = self.run.items.select_related("photo").all()
        status = self.request.query_params.get("status", "all")
        if status == "all":
            return items
        if status in Photo.State.values:
            return items.filter(photo__state=status)
        if status in {ImportItem.Result.FAILED, ImportItem.Result.SKIPPED}:
            return items.filter(result=status)
        raise serializers.ValidationError({"status": "Choose a valid import item status."})

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["candidate_visits"] = list(self.run.trip.visits.select_related("place"))
        return context


class ReviewPhotos(APIView):
    @transaction.atomic
    def post(self, request):
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        photo_ids = set(values["photo_ids"])
        photos = Photo.objects.filter(pk__in=photo_ids)
        visit = values.get("visit")
        if visit is not None:
            get_object_or_404(Visit.objects.select_for_update(), pk=visit.pk)
        locked = list(photos.order_by("pk").select_for_update().values_list("pk", flat=True))
        if len(locked) != len(photo_ids):
            raise serializers.ValidationError({"photo_ids": "One or more photos do not exist."})

        updates = {"state": values["state"], "visit": visit}
        if "captured_on" in values:
            day = values["captured_on"]
            photos.exclude(captured_on=day).update(captured_at=None)
            updates["captured_on"] = day
        return Response({"updated": photos.update(**updates)})
